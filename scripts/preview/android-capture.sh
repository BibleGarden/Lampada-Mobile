#!/usr/bin/env bash
# Boots an x86_64 emulator shaped like Pray_Pixel_API_35 (Pixel profile,
# Android 15 Google Play, 1280x2856 at 480 dpi; the ARM64 image of
# testing/README.md cannot run on an x86_64 runner), installs an APK and runs the
# requested preview flows with Maestro, one screenshot set per flow.
#
# Usage: android-capture.sh <apk> <tooling-dir> <flows-dir> <out-dir> <token>...
# Writes <out-dir>/screens/*.png and <out-dir>/logs/*.
set -euo pipefail
apk="${1:?apk}" tooling="${2:?tooling-dir}" flows="${3:?flows-dir}" out="${4:?out-dir}"
shift 4
(($#)) || { echo 'No preview screens requested.' >&2; exit 2; }
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export ANDROID_HOME="$sdk" ANDROID_SDK_ROOT="$sdk"
export PATH="$sdk/platform-tools:$sdk/emulator:$sdk/cmdline-tools/latest/bin:$PATH"
serial=emulator-5554
avd=Pray_Pixel_API_35
image='system-images;android-35;google_apis_playstore;x86_64'
mkdir -p "$out/screens" "$out/logs"
logs="$(cd "$out/logs" && pwd)"

# No mapfile: macOS ships bash 3.2.
resolved="$(resolve_flows android "$tooling" "$flows" "$@")"
[[ -n "$resolved" ]] || { echo 'None of the requested screens applies to Android.' >&2; exit 2; }
flow_list=()
while IFS= read -r line; do flow_list+=("$line"); done <<<"$resolved"

[[ -w /dev/kvm ]] || { echo '/dev/kvm is not writable: hardware acceleration is unavailable.' >&2; exit 1; }
(set +o pipefail; yes | sdkmanager --licenses >/dev/null 2>&1) || true
(set +o pipefail; yes | sdkmanager --install "$image" emulator platform-tools >"$logs/sdkmanager.log" 2>&1) \
  || { tail -30 "$logs/sdkmanager.log" >&2; exit 1; }
echo no | avdmanager create avd --force --name "$avd" --package "$image" --device pixel >"$logs/avdmanager.log" 2>&1 \
  || { cat "$logs/avdmanager.log" >&2; exit 1; }
avd_dir="$(avdmanager list avd | sed -n 's/^ *Path: *//p' | head -1)"
[[ -f "$avd_dir/config.ini" ]] || { echo "AVD config not found; avdmanager reports: $(avdmanager list avd)" >&2; exit 1; }
config="$avd_dir/config.ini"
set_config() { sed -i "/^$1=/d" "$config"; echo "$1=$2" >> "$config"; }
sed -i '/^skin\./d' "$config"
set_config hw.lcd.width 1280
set_config hw.lcd.height 2856
set_config hw.lcd.density 480
set_config hw.ramSize 4096
set_config hw.cpu.ncore 4
set_config hw.keyboard yes
set_config disk.dataPartition.size 6G

nohup emulator -avd "$avd" -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics \
  -gpu swiftshader_indirect -accel on >"$logs/emulator.log" 2>&1 &
emulator_pid=$!
trap 'kill "$emulator_pid" 2>/dev/null || true; adb -s "$serial" emu kill >/dev/null 2>&1 || true' EXIT
adb wait-for-device
for _ in $(seq 1 180); do
  [[ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && break
  kill -0 "$emulator_pid" 2>/dev/null || { tail -30 "$logs/emulator.log" >&2; echo 'The emulator exited.' >&2; exit 1; }
  sleep 5
done
[[ "$(adb -s "$serial" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]] \
  || { tail -30 "$logs/emulator.log" >&2; echo 'The emulator did not boot in 15 minutes.' >&2; exit 1; }
echo "Emulator: $(adb -s "$serial" emu avd name | head -1 | tr -d '\r'), $(adb -s "$serial" shell wm size | tr -d '\r'), $(adb -s "$serial" shell wm density | tr -d '\r')"

# The same system-bar content in every run; no animation timing in screenshots.
for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb -s "$serial" shell settings put global "$scale" 0
done
adb -s "$serial" shell settings put secure spell_checker_enabled 0
adb -s "$serial" shell settings put global sysui_demo_allowed 1
broadcast() { adb -s "$serial" shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
broadcast enter
broadcast clock -e hhmm 0941
broadcast battery -e level 100 -e plugged false -e powersave false
broadcast network -e wifi show -e level 4 -e fully true
broadcast network -e mobile hide
broadcast notifications -e visible false

ANDROID_BOOT_SETTLE_SECONDS="${ANDROID_BOOT_SETTLE_SECONDS:-60}" \
  node "$tooling/scripts/android-guest-load.mjs" boot --device "$serial" >"$logs/guest-boot.log" 2>&1 \
  || { tail -30 "$logs/guest-boot.log" >&2; exit 1; }
adb -s "$serial" install -r "$apk" >"$logs/install.log" 2>&1 || { tail -30 "$logs/install.log" >&2; exit 1; }
adb -s "$serial" shell pm grant app.lampada android.permission.RECORD_AUDIO
adb -s "$serial" shell pm grant app.lampada android.permission.POST_NOTIFICATIONS
bash "$tooling/scripts/android-maestro-driver.sh" "$serial" "$logs" >"$logs/driver.log" 2>&1 || { tail -30 "$logs/driver.log" >&2; exit 1; }

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
failed=0
for entry in "${flow_list[@]}"; do
  name="${entry%%$'\t'*}"
  path="${entry#*$'\t'}"
  run="$logs/maestro-$name"
  mkdir -p "$run"
  echo "== flow $name ($path)"
  if ! (cd "$run" && node "$tooling/scripts/android-guest-load.mjs" run --device "$serial" --flow "$name" \
    -- maestro --device "$serial" test --no-reinstall-driver --test-output-dir "$run" "$path") >"$logs/flow-$name.log" 2>&1; then
    echo "Flow $name FAILED:" >&2
    tail -40 "$logs/flow-$name.log" >&2
    adb -s "$serial" exec-out screencap -p >"$logs/$name-failure.png" 2>/dev/null || true
    failed=1
    continue
  fi
  count="$(collect_screenshots "$run" "$out/screens")"
  if [[ "$count" == 0 ]]; then
    adb -s "$serial" exec-out screencap -p >"$out/screens/$name-final.png"
    echo "Flow $name took no screenshots; saved the final screen as $name-final.png"
  fi
done
exit "$failed"
