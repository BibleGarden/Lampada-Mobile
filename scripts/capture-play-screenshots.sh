#!/usr/bin/env bash
# Capture one locale of Google Play phone screenshots on the named test emulator.
set -euo pipefail
cd "$(dirname "$0")/.."

locale="${1:?Usage: scripts/capture-play-screenshots.sh <ru|uk|en>}"
case "$locale" in ru|uk|en) ;; *) echo 'Locale must be ru, uk or en' >&2; exit 2 ;; esac
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK directory}"
serial=emulator-5554
adb_cmd=(adb -s "$serial")
fixture="store/screenshots/android-fixtures/$locale.json"
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/lampada-play-${locale}.XXXXXX")"
printf 'Run artifacts: %s\n' "$run_dir"

"${adb_cmd[@]}" get-state | grep -qx device
avd="$("${adb_cmd[@]}" emu avd name | tr -d '\r' | head -1)"
[ "$avd" = Pray_Pixel_API_35 ] || { echo "Wrong emulator: $avd" >&2; exit 1; }
python3 scripts/appstore-video-mock.py --fixture "$fixture" --pacing store/video/pacing.json --validate

mock_pid=''
mock_app_installed=0
restore() {
  local status=$?
  trap - EXIT
  if [ -n "$mock_pid" ]; then kill "$mock_pid" 2>/dev/null || true; wait "$mock_pid" 2>/dev/null || true; fi
  "${adb_cmd[@]}" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null || true
  "${adb_cmd[@]}" shell settings put global sysui_demo_allowed 0 || true
  "${adb_cmd[@]}" shell wm size reset || true
  "${adb_cmd[@]}" shell wm density reset || true
  "${adb_cmd[@]}" shell cmd alarm set-timezone Europe/Moscow || true
  "${adb_cmd[@]}" shell settings put global auto_time_zone 1 || true
  "${adb_cmd[@]}" shell settings delete secure spell_checker_enabled >/dev/null || true
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
npx expo prebuild --platform android >"$run_dir/prebuild.log" 2>&1 || { tail -40 "$run_dir/prebuild.log" >&2; exit 1; }
(cd android && NODE_ENV=production ./gradlew assembleRelease) >"$run_dir/gradle.log" 2>&1 || { tail -40 "$run_dir/gradle.log" >&2; exit 1; }
ANDROID_PROBE_OUTPUT="$run_dir/probe" bash scripts/build-android-test-probe.sh >"$run_dir/probe-build.log" 2>&1 || { tail -40 "$run_dir/probe-build.log" >&2; exit 1; }
"${adb_cmd[@]}" install -r android/app/build/outputs/apk/release/app-release.apk >"$run_dir/install.log"
mock_app_installed=1
"${adb_cmd[@]}" install -r "$run_dir/probe/LampadaTestProbe.apk" >>"$run_dir/install.log"

"${adb_cmd[@]}" shell settings put global auto_time_zone 0
"${adb_cmd[@]}" shell cmd alarm set-timezone America/Bogota
"${adb_cmd[@]}" shell wm size 1280x2560
"${adb_cmd[@]}" shell settings put secure spell_checker_enabled 0
"${adb_cmd[@]}" shell settings put global sysui_demo_allowed 1
broadcast() { "${adb_cmd[@]}" shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
broadcast enter
broadcast clock -e hhmm 0941
broadcast battery -e level 100 -e plugged false -e powersave false
broadcast network -e wifi show -e level 4 -e fully true
broadcast network -e mobile hide
broadcast network -e airplane hide
broadcast notifications -e visible false
broadcast status -e volume hide -e bluetooth hide -e location hide -e alarm hide -e zen hide -e mute hide -e speakerphone hide -e cast hide -e hotspot hide -e sync hide -e tty hide -e eri hide

python3 scripts/appstore-video-mock.py --fixture "$fixture" --pacing store/video/pacing.json --port 9086 --log "$run_dir/mock-requests.jsonl" >"$run_dir/mock.log" 2>&1 &
mock_pid=$!
for _ in {1..30}; do
  if curl -fsS 'http://127.0.0.1:9086/__health' >/dev/null 2>&1; then break; fi
  kill -0 "$mock_pid" 2>/dev/null || { tail -40 "$run_dir/mock.log" >&2; exit 1; }
  sleep 1
done
curl -fsS http://127.0.0.1:9086/__health >/dev/null

"${adb_cmd[@]}" shell pm clear app.lampada >"$run_dir/reset.log"
"${adb_cmd[@]}" shell pm grant app.lampada android.permission.RECORD_AUDIO
"${adb_cmd[@]}" shell pm grant app.lampada android.permission.POST_NOTIFICATIONS
"${adb_cmd[@]}" shell am start -W -n app.lampada/.MainActivity >>"$run_dir/reset.log"
sleep 8
"${adb_cmd[@]}" shell am force-stop app.lampada
today="$("${adb_cmd[@]}" shell date +%F | tr -d '\r')"
python3 scripts/play-screens-seed.py "$fixture" "$locale" "$today" >"$run_dir/seed.log"

flow_env=()
while IFS= read -r value; do flow_env+=("$value"); done < <(python3 - "$fixture" "$locale" <<'PY'
import json, re, sys
item = json.load(open(sys.argv[1]))['locales'][sys.argv[2]]
typed = item['typed']
for key, value in {'TOPIC': typed['intention'], 'ANSWER': typed['answer'], 'TAKEAWAY': typed['takeaway'], 'TOPIC_RE': re.escape(typed['intention']), 'QUESTION_RE': re.escape(item['questions']['first']), 'PASSAGE_RE': re.escape(item['passages'][0]['text'][:20])}.items():
    print(f'{key}={value}')
PY
)
args=()
for value in "${flow_env[@]}"; do args+=(-e "$value"); done
maestro --device "$serial" test --test-output-dir "$run_dir/part1" "${args[@]}" testing/screens/play-screens-1.yaml >"$run_dir/part1.log" 2>&1 || { tail -40 "$run_dir/part1.log" >&2; exit 1; }
sleep 40
maestro --device "$serial" test --test-output-dir "$run_dir/part2" "${args[@]}" testing/screens/play-screens-2.yaml >"$run_dir/part2.log" 2>&1 || { tail -40 "$run_dir/part2.log" >&2; exit 1; }
mkdir "$run_dir/png"
find "$run_dir/part1" "$run_dir/part2" -path '*/takeScreenshot/*.png' -exec cp {} "$run_dir/png/" \;
[ "$(find "$run_dir/png" -name '*.png' | wc -l | tr -d ' ')" = 8 ] || { echo 'Expected eight screenshots' >&2; exit 1; }
printf 'Review eight screenshots in %s/png, then copy selected images to store/screenshots/.\n' "$run_dir"
