#!/usr/bin/env bash
# Capture one locale of Google Play phone screenshots on the named test emulator.
set -euo pipefail
cd "$(dirname "$0")/.."

locale="${1:?Usage: scripts/capture-play-screenshots.sh <ru|uk|en>}"
case "$locale" in ru|uk|en) ;; *) echo 'Locale must be ru, uk or en' >&2; exit 2 ;; esac
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK directory}"
serial=emulator-5554
capture_size=1440x2560
capture_density=480
adb_cmd=("$ANDROID_HOME/platform-tools/adb" -s "$serial")
export PATH="$ANDROID_HOME/platform-tools:$PATH"
overlay="store/screenshots/android-fixtures/$locale.json"
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/lampada-play-${locale}.XXXXXX")"
printf 'Run artifacts: %s\n' "$run_dir"

if ! "${adb_cmd[@]}" get-state 2>"$run_dir/device-error.log" | grep -qx device; then
  echo "Required emulator $serial is unavailable" >&2
  tail -20 "$run_dir/device-error.log" >&2
  exit 1
fi
avd="$("${adb_cmd[@]}" emu avd name | tr -d '\r' | head -1)"
[ "$avd" = Pray_Pixel_API_35 ] || { echo "Wrong emulator: $avd" >&2; exit 1; }
fixture="$run_dir/fixture.json"
python3 scripts/build-play-screenshot-fixture.py store/video/demo-content.json "$overlay" "$locale" "$fixture"
python3 scripts/appstore-video-mock.py --fixture "$fixture" --pacing store/video/pacing.json --validate

original_timezone="$("${adb_cmd[@]}" shell getprop persist.sys.timezone | tr -d '\r')"
original_auto_time_zone="$("${adb_cmd[@]}" shell settings get global auto_time_zone | tr -d '\r')"
original_demo="$("${adb_cmd[@]}" shell settings get global sysui_demo_allowed | tr -d '\r')"
original_spell_checker="$("${adb_cmd[@]}" shell settings get secure spell_checker_enabled | tr -d '\r')"
original_wm_size="$("${adb_cmd[@]}" shell wm size | sed -n 's/^Override size: //p' | tr -d '\r')"
original_wm_density="$("${adb_cmd[@]}" shell wm density | sed -n 's/^Override density: //p' | tr -d '\r')"
restore_setting() {
  local scope="$1" name="$2" value="$3"
  if [ "$value" = null ]; then "${adb_cmd[@]}" shell settings delete "$scope" "$name" >/dev/null;
  else "${adb_cmd[@]}" shell settings put "$scope" "$name" "$value"; fi
}

mock_pid=''
mock_app_installed=0
restore() {
  local status=$?
  trap - EXIT
  if [ -n "$mock_pid" ]; then kill "$mock_pid" 2>/dev/null || true; wait "$mock_pid" 2>/dev/null || true; fi
  "${adb_cmd[@]}" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null || true
  restore_setting global sysui_demo_allowed "$original_demo" || true
  if [ -n "$original_wm_size" ]; then "${adb_cmd[@]}" shell wm size "$original_wm_size"; else "${adb_cmd[@]}" shell wm size reset; fi
  if [ -n "$original_wm_density" ]; then "${adb_cmd[@]}" shell wm density "$original_wm_density"; else "${adb_cmd[@]}" shell wm density reset; fi
  "${adb_cmd[@]}" shell cmd alarm set-timezone "$original_timezone" || true
  restore_setting global auto_time_zone "$original_auto_time_zone" || true
  restore_setting secure spell_checker_enabled "$original_spell_checker" || true
  if [ "$mock_app_installed" -eq 1 ]; then
    "${adb_cmd[@]}" uninstall garden.lampada.testprobe >/dev/null 2>&1 || true
    "${adb_cmd[@]}" uninstall app.lampada >/dev/null 2>&1 || true
  fi
  (cd android && ./gradlew --stop) >"$run_dir/gradle-stop.log" 2>&1 || true
  exit "$status"
}
trap restore EXIT

export EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:9086
export EXPO_PUBLIC_AI_PROXY_KEY=video-preview-mock EXPO_PUBLIC_BUILD_CHANNEL=test
export ANDROID_HOME
if [ -n "${PLAY_CAPTURE_APK:-}" ] || [ -n "${PLAY_CAPTURE_PROBE_APK:-}" ]; then
  : "${PLAY_CAPTURE_APK:?Set both prebuilt APK paths}"
  : "${PLAY_CAPTURE_PROBE_APK:?Set both prebuilt APK paths}"
  [ -f "$PLAY_CAPTURE_APK" ] && [ -f "$PLAY_CAPTURE_PROBE_APK" ] || { echo 'Prebuilt APK is missing' >&2; exit 1; }
else
  npx expo prebuild --platform android >"$run_dir/prebuild.log" 2>&1 || { tail -40 "$run_dir/prebuild.log" >&2; exit 1; }
  (cd android && NODE_ENV=production ./gradlew assembleRelease) >"$run_dir/gradle.log" 2>&1 || { tail -40 "$run_dir/gradle.log" >&2; exit 1; }
  ANDROID_PROBE_OUTPUT="$run_dir/probe" bash scripts/build-android-test-probe.sh >"$run_dir/probe-build.log" 2>&1 || { tail -40 "$run_dir/probe-build.log" >&2; exit 1; }
  PLAY_CAPTURE_APK=android/app/build/outputs/apk/release/app-release.apk
  PLAY_CAPTURE_PROBE_APK="$run_dir/probe/LampadaTestProbe.apk"
fi
(cd android && ./gradlew --stop) >"$run_dir/gradle-stop-before-capture.log" 2>&1
"${adb_cmd[@]}" install -r "$PLAY_CAPTURE_APK" >"$run_dir/install.log" 2>&1 || { echo "App install failed; see $run_dir/install.log" >&2; tail -40 "$run_dir/install.log" >&2; exit 1; }
mock_app_installed=1
"${adb_cmd[@]}" install -r "$PLAY_CAPTURE_PROBE_APK" >>"$run_dir/install.log" 2>&1 || { echo "Probe install failed; see $run_dir/install.log" >&2; tail -40 "$run_dir/install.log" >&2; exit 1; }

"${adb_cmd[@]}" shell settings put global auto_time_zone 0
# Etc/GMT signs are reversed: choose an offset that makes local time 09:xx.
morning_zone="$(python3 - <<'PY'
from datetime import datetime, timezone
utc_hour = datetime.now(timezone.utc).hour
offset = (9 - utc_hour + 12) % 24 - 12
print('Etc/GMT' + ('+' if offset < 0 else '-') + str(abs(offset)))
PY
)"
"${adb_cmd[@]}" shell cmd alarm set-timezone "$morning_zone"
local_hour="$("${adb_cmd[@]}" shell date +%H | tr -d '\r')"
if [ "$local_hour" -lt 8 ] || [ "$local_hour" -gt 11 ]; then
  echo "Emulator local hour is $local_hour, expected 08–11" >&2
  exit 1
fi
# 1440×2560 при 480 dpi даёт 480×853 dp: высота как у утверждённого набора 1280×2560.
"${adb_cmd[@]}" shell wm size "$capture_size"
"${adb_cmd[@]}" shell wm density "$capture_density"
"${adb_cmd[@]}" shell settings put secure spell_checker_enabled 0
"${adb_cmd[@]}" shell settings put global sysui_demo_allowed 1

python3 scripts/appstore-video-mock.py --fixture "$fixture" --pacing store/video/pacing.json --port 9086 --log "$run_dir/mock-requests.jsonl" >"$run_dir/mock.log" 2>&1 &
mock_pid=$!
for _ in {1..30}; do
  if curl -fsS 'http://127.0.0.1:9086/__health' >/dev/null 2>&1; then break; fi
  kill -0 "$mock_pid" 2>/dev/null || { tail -40 "$run_dir/mock.log" >&2; exit 1; }
  sleep 1
done
curl -fsS http://127.0.0.1:9086/__health >/dev/null

node scripts/android-guest-load.mjs boot --device "$serial" >"$run_dir/guest-boot.log" 2>&1
node scripts/android-guest-load.mjs run --device "$serial" --flow seed-ready --flow-log "$run_dir/seed-ready.log" -- true >"$run_dir/seed-ready.runner.log" 2>&1
"${adb_cmd[@]}" shell pm clear app.lampada >"$run_dir/reset.log"
"${adb_cmd[@]}" shell pm grant app.lampada android.permission.RECORD_AUDIO
"${adb_cmd[@]}" shell pm grant app.lampada android.permission.POST_NOTIFICATIONS
"${adb_cmd[@]}" shell am start -W -n app.lampada/.MainActivity >>"$run_dir/reset.log"
sleep 8
"${adb_cmd[@]}" shell am force-stop app.lampada
today="$("${adb_cmd[@]}" shell date +%F | tr -d '\r')"
python3 scripts/play-screens-seed.py "$serial" "$fixture" "$locale" "$today" >"$run_dir/seed.log"

# Heredoc внутри <(...) bash 3.2 из macOS разбирает с brace expansion, поэтому значения идут через файл.
python3 - "$fixture" "$locale" >"$run_dir/flow-env" <<'PY'
import json, re, sys
item = json.load(open(sys.argv[1]))['locales'][sys.argv[2]]
typed = item['typed']
for key, value in {'TOPIC': typed['intention'], 'ANSWER': typed['answer'], 'TAKEAWAY': typed['takeaway'], 'TOPIC_RE': re.escape(typed['intention']), 'QUESTION_RE': re.escape(item['questions']['first']), 'PASSAGE_RE': re.escape(item['passages'][0]['text'][:20])}.items():
    print(f'{key}={value}')
PY
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
args=()
while IFS= read -r value; do args+=(-e "$value"); done <"$run_dir/flow-env"
# Демо-режим включается перед самыми флоу: сразу после wm size/density SystemUI ещё пересоздаёт строку состояния и теряет значок Wi-Fi.
broadcast() { "${adb_cmd[@]}" shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
broadcast enter
broadcast clock -e hhmm 0941
broadcast battery -e level 100 -e plugged false -e powersave false
broadcast network -e wifi show -e level 4 -e fully true
broadcast network -e mobile hide
broadcast network -e airplane hide
broadcast notifications -e visible false
broadcast status -e volume hide -e bluetooth hide -e location hide -e alarm hide -e zen hide -e mute hide -e speakerphone hide -e cast hide -e hotspot hide -e sync hide -e tty hide -e eri hide
bash scripts/android-maestro-driver.sh "$serial" "$run_dir" >"$run_dir/driver.log" 2>&1
node scripts/android-guest-load.mjs run --device "$serial" --flow play-screens-1 --flow-log "$run_dir/part1.log" -- maestro --device "$serial" test --no-reinstall-driver --test-output-dir "$run_dir/part1" "${args[@]}" testing/screens/play-screens-1.yaml >"$run_dir/part1.runner.log" 2>&1 || { tail -40 "$run_dir/part1.log" >&2; exit 1; }
maestro --device "$serial" test --no-reinstall-driver --test-output-dir "$run_dir/part2" "${args[@]}" testing/screens/play-screens-2.yaml >"$run_dir/part2.log" 2>&1 || { tail -40 "$run_dir/part2.log" >&2; exit 1; }
mkdir "$run_dir/png"
find "$run_dir/part1" "$run_dir/part2" -path '*/takeScreenshot/*.png' -exec cp {} "$run_dir/png/" \;
[ "$(find "$run_dir/png" -name '*.png' | wc -l | tr -d ' ')" = 8 ] || { echo 'Expected eight screenshots' >&2; exit 1; }
python3 - "$run_dir/png" <<'PY'
import pathlib, struct, sys
for png in sorted(pathlib.Path(sys.argv[1]).glob('*.png')):
    size = struct.unpack('>II', png.read_bytes()[16:24])
    if size != (1440, 2560):
        sys.exit(f'{png.name} is {size[0]}x{size[1]}, expected 1440x2560')
PY
printf 'Review eight screenshots in %s/png, then copy selected images to store/screenshots/.\n' "$run_dir"
