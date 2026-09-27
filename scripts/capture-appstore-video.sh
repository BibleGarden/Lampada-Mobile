#!/usr/bin/env bash
# Capture real simulator video for one App Store preview locale.
# Requires an installed Release build of twinkler on the named App Store simulator.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCALE="${1:-}"
DEVICE_NAME='Lampada AppStore UK iPhone 17 Pro Max'
FIXTURE='store/video/demo-content.json'
MOCK_PORT=9086
MOCK_URL="http://127.0.0.1:$MOCK_PORT"
REVIEW_PADDING="$(python3 - <<'PY'
import json
from pathlib import Path
print(json.loads(Path('store/video/pacing.json').read_text())['review_tail_padding_seconds'])
PY
)"
CAPTURE_VALUES="$(python3 - "$LOCALE" <<'PY'
import json, sys
item = json.load(open('store/video/demo-content.json'))['locales'][sys.argv[1]]['capture']
print('\t'.join((item['system_locale'], item['system_keyboard'], item['home_label'])))
PY
)"
IFS=$'\t' read -r SYS_LOCALE SYS_KEYBOARD HOME_LABEL <<< "$CAPTURE_VALUES"
SYS_LANG="$LOCALE"

UDID="$(testing/e2e/sim-udid.sh "$DEVICE_NAME")"
SHOWTIME="${PRAY_VIDEO_SHOWTIME:-$(bash scripts/build-showtime.sh)}"
APP_TZ="$(python3 - <<'PY'
from datetime import datetime, timezone

utc_hour = datetime.now(timezone.utc).hour
offset = (9 - utc_hour + 12) % 24 - 12
print('Etc/GMT' if offset == 0 else f'Etc/GMT{"+" if offset < 0 else "-"}{abs(offset)}')
PY
)"
WORK_DIR="${PRAY_VIDEO_SCRATCH_DIR:?Set PRAY_VIDEO_SCRATCH_DIR to an external scratch directory}"
RETAKE_SOURCE="${PRAY_VIDEO_RETAKE_SOURCE:-}"
KEYBOARD_MAP="${PRAY_VIDEO_KEYBOARD_MAP:?Keyboard layout preflight did not provide a map}"
LOG_DIR="${PRAY_VIDEO_LOG_DIR:-$WORK_DIR/logs}"
mkdir -p "$LOG_DIR" "$WORK_DIR/raw" "$WORK_DIR/review"
if [ -n "$RETAKE_SOURCE" ]; then
  SEED_DB="$RETAKE_SOURCE/seed/$LOCALE.db"
  COORDS="$RETAKE_SOURCE/logs/calibrated-coordinates.json"
  [ -f "$SEED_DB" ] && [ -f "$COORDS" ] || {
    echo "Retake seed or calibrated coordinates missing in $RETAKE_SOURCE" >&2
    exit 1
  }
else
  SEED_DB="$WORK_DIR/seed/$LOCALE.db"
  COORDS="$LOG_DIR/calibrated-coordinates.json"
fi
STAGE_FILE="$LOG_DIR/stage-seconds.tsv"
: > "$STAGE_FILE"
now_seconds() { python3 -c 'import time; print(time.monotonic())'; }
record_stage() {
  python3 - "$1" "$2" "$STAGE_FILE" <<'PY'
import sys
import time
from pathlib import Path
name, started, path = sys.argv[1:]
with Path(path).open('a') as out:
    out.write(f'{name}\t{time.monotonic() - float(started):.3f}\n')
PY
}
RECORD_PID=''
MOCK_PID=''

sim_state() {
  xcrun simctl list devices -j | python3 -c '
import json, sys
udid = sys.argv[1]
items = [device for group in json.load(sys.stdin)["devices"].values() for device in group if device["udid"] == udid]
if len(items) != 1:
    raise SystemExit("Expected exactly one matching simulator")
print(items[0]["state"])
' "$UDID"
}

stop_recording() {
  if [ -n "$RECORD_PID" ]; then
    kill -INT "$RECORD_PID" 2>/dev/null || true
    wait "$RECORD_PID" || true
    RECORD_PID=''
  fi
}

cleanup() {
  rc=$?
  trap - EXIT
  if [ -n "$RECORD_PID" ]; then
    kill -INT "$RECORD_PID" 2>/dev/null || true
    wait "$RECORD_PID" 2>/dev/null || true
  fi
  if [ -n "$MOCK_PID" ]; then
    kill -TERM "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
  fi
  state="$(sim_state)" || state=''
  if [ "$state" = Booted ]; then
    xcrun simctl status_bar "$UDID" clear || true
    xcrun simctl shutdown "$UDID" || true
  fi
  exit "$rc"
}
trap cleanup EXIT

BOOT_SEED_START="$(now_seconds)"
python3 scripts/appstore-video-mock.py --fixture "$FIXTURE" --pacing store/video/pacing.json --validate > "$LOG_DIR/mock-fixture-check.log"
if [ -z "$RETAKE_SOURCE" ]; then
  python3 scripts/appstore-video-seed-db.py create --locale "$LOCALE" --app-timezone "$APP_TZ" \
    --fixture "$FIXTURE" --output "$SEED_DB" > "$LOG_DIR/seed-create.log" 2>&1
fi
VIDEO_APP="${PRAY_VIDEO_APP_PATH:-$WORK_DIR/Lampada-video-mock.app}"
[ -f "$VIDEO_APP/main.jsbundle" ] || { echo 'Build the video mock Release app first.' >&2; exit 1; }
grep -q -a -F "$MOCK_URL" "$VIDEO_APP/main.jsbundle" || {
  echo 'Installed candidate is not built for this mock URL' >&2
  exit 1
}
python3 scripts/appstore-video-mock.py --fixture "$FIXTURE" --pacing store/video/pacing.json --port "$MOCK_PORT" \
  --log "$LOG_DIR/mock-requests.jsonl" > "$LOG_DIR/mock-server.log" 2>&1 &
MOCK_PID=$!
python3 - "$MOCK_URL" "$MOCK_PID" <<'PY'
import os
import sys
import time
from urllib.request import urlopen

url, pid = sys.argv[1], int(sys.argv[2])
for _ in range(50):
    try:
        with urlopen(f'{url}/__health', timeout=1) as response:
            if response.status == 200:
                break
    except Exception:
        pass
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        raise SystemExit('Video mock exited before its health check')
    time.sleep(0.1)
else:
    raise SystemExit('Video mock health check failed')
PY

check_mock_errors() {
  python3 - "$LOG_DIR/mock-requests.jsonl" <<'PY'
import json
import sys
from pathlib import Path
entries = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
errors = [entry for entry in entries if entry['status'] >= 400]
if errors:
    raise SystemExit(f"Video mock returned {len(errors)} non-2xx responses; see {sys.argv[1]}")
PY
}

# The status-bar override is visual only. Give the app a timezone whose local
# hour is 9, so its time-based greeting agrees with 9:41 in the recording.
launch_with_showtime() {
  stage="$1"
  SIMCTL_CHILD_DYLD_INSERT_LIBRARIES="$SHOWTIME" SIMCTL_CHILD_TZ="$APP_TZ" \
    xcrun simctl launch --terminate-running-process "$UDID" twinkler \
    > "$LOG_DIR/${stage}-showtime-launch.log" 2>&1
}

# Keep app launch and its black transition off camera. The first recorded frame
# must already show the seeded home screen.
await_home() {
  stage="$1"
  python3 - "$UDID" "$LOG_DIR/${stage}-home-preflight.json" "$HOME_LABEL" <<'PY'
import json
import subprocess
import sys
import time
from pathlib import Path

udid, output, expected_label = sys.argv[1:]
deadline = time.monotonic() + 30
while True:
    result = subprocess.run(
        ['axe', 'describe-ui', '--udid', udid, '--point', '220,852'],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        data = json.loads(result.stdout)
        if data.get('AXLabel') == expected_label and data.get('enabled'):
            Path(output).write_text(result.stdout)
            time.sleep(1)
            break
    if time.monotonic() >= deadline:
        raise SystemExit(f'Home screen not ready before recording: {result.stderr.strip()}')
    time.sleep(0.5)
PY
}


if [ -z "$RETAKE_SOURCE" ]; then
if [ "$(sim_state)" = Shutdown ]; then xcrun simctl boot "$UDID"; fi
xcrun simctl bootstatus "$UDID" -b > "$LOG_DIR/boot.log" 2>&1
if [ "${PRAY_VIDEO_SKIP_INSTALL:-0}" = 1 ]; then
  INSTALLED_APP="$(xcrun simctl get_app_container "$UDID" twinkler app)"
  [ "$(shasum -a 256 "$INSTALLED_APP/main.jsbundle" | cut -d ' ' -f1)" = "$(shasum -a 256 "$VIDEO_APP/main.jsbundle" | cut -d ' ' -f1)" ] || {
    echo 'Installed simulator bundle differs from the selected video app' >&2
    exit 1
  }
  printf 'Skipped install; installed bundle SHA-256 matches candidate\n' > "$LOG_DIR/video-app-install.log"
else
  xcrun simctl install "$UDID" "$VIDEO_APP" > "$LOG_DIR/video-app-install.log" 2>&1
fi
DATA_CONTAINER="$(xcrun simctl get_app_container "$UDID" twinkler data)"
APP_CONTAINER="$(xcrun simctl get_app_container "$UDID" twinkler app)"
printf '%s\n' "$DATA_CONTAINER" > "$LOG_DIR/data-container.txt"
printf '%s\n' "$APP_CONTAINER" > "$LOG_DIR/app-container.txt"
xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string "$SYS_LOCALE"
xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array "$SYS_LANG"
xcrun simctl spawn "$UDID" defaults write -g AppleKeyboards -array "$SYS_KEYBOARD"
xcrun simctl shutdown "$UDID"
while [ "$(sim_state)" != Shutdown ]; do sleep 1; done
python3 scripts/appstore-video-seed-db.py install --database "$SEED_DB" --fixture "$FIXTURE" \
  --container "$DATA_CONTAINER" --udid "$UDID" > "$LOG_DIR/seed-calibration.log" 2>&1
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b > "$LOG_DIR/reboot.log" 2>&1
# 'charged' draws a lightning bolt; discharging at 100% shows a full battery.
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState discharging \
  --batteryLevel 100 --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4
xcrun simctl get_app_container "$UDID" twinkler app > "$LOG_DIR/app-container.log" 2>&1 || {
  echo 'Release build twinkler is not installed on the App Store simulator' >&2
  exit 1
}


check_mock_errors
launch_with_showtime calibration
await_home calibration
record_stage boot_seed_calibration "$BOOT_SEED_START"
CALIBRATION_START="$(now_seconds)"
set +e
python3 scripts/run-appstore-video-take.py --mode calibrate --locale "$LOCALE" --pacing store/video/pacing.json \
  --udid "$UDID" --log-dir "$LOG_DIR/calibration" --coords "$COORDS" --fixture "$FIXTURE" --keyboard-map "$KEYBOARD_MAP" \
  > "$LOG_DIR/calibration.log" 2>&1
calibration_rc=$?
set -e
printf '%s\n' "$calibration_rc" > "$LOG_DIR/calibration.exit"
if [ "$calibration_rc" -ne 0 ]; then tail -25 "$LOG_DIR/calibration.log" >&2; exit "$calibration_rc"; fi
record_stage calibration "$CALIBRATION_START"
else
  INSTALLED_APP="$(cat "$RETAKE_SOURCE/logs/app-container.txt")"
  [ "$(shasum -a 256 "$INSTALLED_APP/main.jsbundle" | cut -d ' ' -f1)" = "$(shasum -a 256 "$VIDEO_APP/main.jsbundle" | cut -d ' ' -f1)" ] || {
    echo 'Installed simulator bundle differs from the selected video app' >&2
    exit 1
  }
  DATA_CONTAINER="$(cat "$RETAKE_SOURCE/logs/data-container.txt")"
  [ -d "$DATA_CONTAINER" ] || { echo "Retake app data container missing: $DATA_CONTAINER" >&2; exit 1; }
  printf 'boot_seed_calibration\t0\ncalibration\t0\n' >> "$STAGE_FILE"
fi
check_mock_errors

# The calibration session is disposable. Restore the same immutable DB before
# recording so the journal and consent state match the first pass exactly.
TAKE_SEED_START="$(now_seconds)"
if [ "$(sim_state)" = Booted ]; then xcrun simctl shutdown "$UDID"; fi
while [ "$(sim_state)" != Shutdown ]; do sleep 1; done
python3 scripts/appstore-video-seed-db.py install --database "$SEED_DB" --fixture "$FIXTURE" \
  --container "$DATA_CONTAINER" --udid "$UDID" > "$LOG_DIR/seed-take.log" 2>&1
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b > "$LOG_DIR/take-reboot.log" 2>&1
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState discharging \
  --batteryLevel 100 --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4
launch_with_showtime take
await_home take
git rev-parse HEAD > "$LOG_DIR/source-commit.txt"
git status --short > "$LOG_DIR/source-status.txt"
APP_PATH="$(xcrun simctl get_app_container "$UDID" twinkler app)"
plutil -extract CFBundleIdentifier raw -o - "$APP_PATH/Info.plist" > "$LOG_DIR/build-bundle-id.txt"
plutil -extract CFBundleShortVersionString raw -o - "$APP_PATH/Info.plist" > "$LOG_DIR/build-version.txt"
plutil -extract CFBundleVersion raw -o - "$APP_PATH/Info.plist" > "$LOG_DIR/build-number.txt"
shasum -a 256 "$APP_PATH/main.jsbundle" > "$LOG_DIR/build-jsbundle-sha256.txt"
set +e
python3 scripts/run-appstore-video-take.py --mode keyboard-preflight --locale "$LOCALE" --pacing store/video/pacing.json \
  --udid "$UDID" --log-dir "$LOG_DIR/keyboard-preflight" --coords "$COORDS" --fixture "$FIXTURE" --keyboard-map "$KEYBOARD_MAP" \
  > "$LOG_DIR/keyboard-preflight.log" 2>&1
keyboard_rc=$?
set -e
printf '%s\n' "$keyboard_rc" > "$LOG_DIR/keyboard-preflight.exit"
if [ "$keyboard_rc" -ne 0 ]; then tail -25 "$LOG_DIR/keyboard-preflight.log" >&2; exit "$keyboard_rc"; fi
launch_with_showtime take
await_home take
record_stage boot_seed_take "$TAKE_SEED_START"

capture_take() {
  record_start="$(now_seconds)"
  raw="$WORK_DIR/raw/${LOCALE}-full.mp4"
  record_log="$LOG_DIR/${LOCALE}-full.record.log"
  flow_log="$LOG_DIR/${LOCALE}-full.axe.log"
  xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$raw" > "$record_log" 2>&1 &
  RECORD_PID=$!
  ready=0
  for _ in $(seq 1 100); do
    if grep -q 'Recording started' "$record_log"; then ready=1; break; fi
    if ! kill -0 "$RECORD_PID" 2>/dev/null; then break; fi
    sleep 0.1
  done
  [ "$ready" -eq 1 ] || { cat "$record_log" >&2; exit 1; }
  markers="$WORK_DIR/raw/${LOCALE}-full.markers.json"
  host_markers="$LOG_DIR/${LOCALE}-host.markers.json"
  python3 - "$markers" "$host_markers" <<'PY'
from pathlib import Path
import sys
for name in sys.argv[1:]:
    Path(name).unlink(missing_ok=True)
PY
  record_origin="$(python3 -c 'import time; print(time.monotonic())')"
  set +e
  python3 scripts/run-appstore-video-take.py --mode record --locale "$LOCALE" --pacing store/video/pacing.json --udid "$UDID" \
    --log-dir "$LOG_DIR/recorded" --coords "$COORDS" --fixture "$FIXTURE" --keyboard-map "$KEYBOARD_MAP" \
    --record-origin "$record_origin" --markers "$host_markers" > "$flow_log" 2>&1
  flow_rc=$?
  set -e
  printf '%s\n' "$flow_rc" > "$LOG_DIR/${LOCALE}-full.axe.exit"
  stop_recording
  if [ "$flow_rc" -ne 0 ]; then tail -25 "$flow_log" >&2; exit "$flow_rc"; fi
  set +e
  python3 scripts/appstore-video-sync.py --raw "$raw" --host-markers "$host_markers" \
    --video-markers "$markers" --coords "$COORDS" --pacing store/video/pacing.json \
    --report "$LOG_DIR/clock-sync.json" > "$LOG_DIR/clock-sync.log" 2>&1
  sync_rc=$?
  set -e
  printf '%s\n' "$sync_rc" > "$LOG_DIR/clock-sync.exit"
  if [ "$sync_rc" -ne 0 ]; then tail -25 "$LOG_DIR/clock-sync.log" >&2; exit "$sync_rc"; fi
  record_stage record "$record_start"
  verify_start="$(now_seconds)"
  set +e
  python3 scripts/run-appstore-video-take.py --mode verify --locale "$LOCALE" --pacing store/video/pacing.json --udid "$UDID" \
    --log-dir "$LOG_DIR/verification" --coords "$COORDS" --fixture "$FIXTURE" --keyboard-map "$KEYBOARD_MAP" > "$LOG_DIR/verification.log" 2>&1
  verify_rc=$?
  set -e
  printf '%s\n' "$verify_rc" > "$LOG_DIR/verification.exit"
  if [ "$verify_rc" -ne 0 ]; then tail -25 "$LOG_DIR/verification.log" >&2; exit "$verify_rc"; fi
  python3 - "$LOG_DIR/mock-requests.jsonl" <<'PY'
import json
import sys
from pathlib import Path
entries = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
bad = [entry for entry in entries if entry['status'] >= 400]
kinds = {entry['kind'] for entry in entries}
stages = {entry.get('stage') for entry in entries if entry['kind'] == 'question'}
if bad or not {'question', 'scripture', 'version'} <= kinds or not {'first', 'next', 'reflect'} <= stages:
    raise SystemExit(f'Video mock request verification failed: {len(bad)} errors, kinds={sorted(kinds)}, stages={sorted(str(s) for s in stages)}')
print(f'Video mock verified {len(entries)} requests')
PY
  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$raw")"
  printf '%s\n' "$duration" > "$LOG_DIR/${LOCALE}-full.duration"
  ffmpeg -v error -i "$raw" -vf fps=30 -f null - > "$LOG_DIR/${LOCALE}-full.decode.log" 2>&1
  [ ! -s "$LOG_DIR/${LOCALE}-full.decode.log" ] || { cat "$LOG_DIR/${LOCALE}-full.decode.log" >&2; exit 1; }
  review="$WORK_DIR/review/appstore-${LOCALE}-full.mp4"
  # recordVideo stops emitting frames on a still journal screen. Preserve its
  # on-camera reading pause in the review copy by extending that final frame.
  review_duration="$(python3 -c 'import sys; print(float(sys.argv[1]) + float(sys.argv[2]))' "$duration" "$REVIEW_PADDING")"
  printf '%s\n' "$review_duration" > "$LOG_DIR/${LOCALE}-full.review-duration"
  ffmpeg -y -v error -i "$raw" -f lavfi -i anullsrc=r=48000:cl=stereo \
    -vf "fps=30,scale=886:1920:force_original_aspect_ratio=increase,crop=886:1920,setsar=1,tpad=stop_mode=clone:stop_duration=$REVIEW_PADDING" \
    -map 0:v:0 -map 1:a:0 -t "$review_duration" -c:v libx264 -preset slow -crf 18 \
    -maxrate 12M -bufsize 16M -profile:v high -level 4.2 -pix_fmt yuv420p \
    -c:a aac -b:a 128k -ac 2 -movflags +faststart "$review" \
    > "$LOG_DIR/${LOCALE}-full.review.log" 2>&1
  ffmpeg -v error -i "$review" -f null - > "$LOG_DIR/${LOCALE}-full.review-decode.log" 2>&1
  [ ! -s "$LOG_DIR/${LOCALE}-full.review-decode.log" ] || { cat "$LOG_DIR/${LOCALE}-full.review-decode.log" >&2; exit 1; }
  record_stage verification "$verify_start"
  printf 'Captured %s (%ss) and review copy %s (%ss)\n' "$raw" "$duration" "$review" "$review_duration"
}

capture_take
printf 'Continuous take complete; logs: %s\n' "$LOG_DIR"
