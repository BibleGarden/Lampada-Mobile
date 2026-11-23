#!/usr/bin/env bash
# Creates and boots an x86_64 emulator shaped like Pray_Pixel_API_35 (Pixel
# profile, Android 15 Google Play, 1280x2856 at 480 dpi; the ARM64 image of
# testing/README.md cannot run on an x86_64 runner) and leaves it running for
# the next steps of the job. It starts no app.
#
# Usage: android-emulator.sh <tooling-dir> <log-dir>
set -euo pipefail
tooling="${1:?tooling-dir}" logs="${2:?log-dir}"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export ANDROID_HOME="$sdk" ANDROID_SDK_ROOT="$sdk"
export PATH="$sdk/platform-tools:$sdk/emulator:$sdk/cmdline-tools/latest/bin:$PATH"
serial=emulator-5554
avd=Pray_Pixel_API_35
image='system-images;android-35;google_apis_playstore;x86_64'
# avdmanager and the emulator must look in the same place.
export ANDROID_AVD_HOME="$HOME/.android/avd"
mkdir -p "$ANDROID_AVD_HOME" "$logs"
logs="$(cd "$logs" && pwd)"

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

# A Play image accepts only adb keys it knew at boot: create the host key and
# start the adb server before the emulator, or the device stays "unauthorized".
[[ -f "$HOME/.android/adbkey" ]] || adb keygen "$HOME/.android/adbkey"
adb start-server
nohup setsid emulator -avd "$avd" -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics \
  -gpu swiftshader_indirect -accel on >"$logs/emulator.log" 2>&1 &
emulator_pid=$!
disown "$emulator_pid"
for _ in $(seq 1 24); do
  adb devices | grep -q "^$serial" && break
  kill -0 "$emulator_pid" 2>/dev/null || { cat "$logs/emulator.log" >&2; echo 'The emulator exited before it was visible to adb.' >&2; exit 1; }
  sleep 5
done
adb -s "$serial" wait-for-device
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
adb -s "$serial" exec-out screencap -p >"$logs/emulator-ready.png"
echo "Emulator ready."
