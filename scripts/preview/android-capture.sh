#!/usr/bin/env bash
# Installs an APK on the emulator that android-emulator.sh started and runs the
# requested preview flows with Maestro, one screenshot set per flow.
#
# Usage: android-capture.sh <apk> <tooling-dir> <flows-dir> <out-dir> <token>...
# Writes <out-dir>/screens/*.png and <out-dir>/logs/*. Needs no secrets.
set -euo pipefail
apk="${1:?apk}" tooling="${2:?tooling-dir}" flows="${3:?flows-dir}" out="${4:?out-dir}"
shift 4
(($#)) || { echo 'No preview screens requested.' >&2; exit 2; }
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export ANDROID_HOME="$sdk" ANDROID_SDK_ROOT="$sdk"
export PATH="$sdk/platform-tools:$sdk/emulator:$PATH"
serial=emulator-5554
mkdir -p "$out/screens" "$out/logs"
logs="$(cd "$out/logs" && pwd)"

# No mapfile: macOS ships bash 3.2.
resolved="$(resolve_flows android "$tooling" "$flows" "$@")"
[[ -n "$resolved" ]] || { echo 'None of the requested screens applies to Android.' >&2; exit 2; }
flow_list=()
while IFS= read -r line; do flow_list+=("$line"); done <<<"$resolved"

adb -s "$serial" install -r "$apk" >"$logs/install.log" 2>&1 || { tail -30 "$logs/install.log" >&2; exit 1; }
adb -s "$serial" shell pm grant app.lampada android.permission.RECORD_AUDIO
adb -s "$serial" shell pm grant app.lampada android.permission.POST_NOTIFICATIONS
bash "$tooling/scripts/android-maestro-driver.sh" "$serial" "$logs" >"$logs/driver.log" 2>&1 || { tail -30 "$logs/driver.log" >&2; exit 1; }

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
# A software-rendered 4-vCPU guest stays busier than the Mac emulator the
# gate's defaults were measured on (guest load ~20 right after boot).
export ANDROID_QUIET_LOAD="${ANDROID_QUIET_LOAD:-8}" ANDROID_QUIET_TIMEOUT_SECONDS="${ANDROID_QUIET_TIMEOUT_SECONDS:-600}"
failed=0
for entry in "${flow_list[@]}"; do
  name="${entry%%$'\t'*}"
  path="${entry#*$'\t'}"
  run="$logs/maestro-$name"
  mkdir -p "$run"
  echo "== flow $name ($path)"
  bash "$tooling/scripts/preview/android-status-bar.sh" "$serial"
  if ! (cd "$run" && node "$tooling/scripts/android-guest-load.mjs" run --device "$serial" --flow "$name" \
    -- maestro --device "$serial" test --no-reinstall-driver --test-output-dir "$run" "$path") >"$logs/flow-$name.log" 2>&1; then
    echo "Flow $name FAILED:" >&2
    tail -40 "$logs/flow-$name.log" >&2
    adb -s "$serial" exec-out screencap -p >"$logs/$name-failure.png" 2>/dev/null || true
    failed=1
    continue
  fi
  if ! count="$(collect_screenshots "$run" "$out/screens")"; then
    echo "Flow $name FAILED: a screenshot it took is empty." >&2
    failed=1
    continue
  fi
  if [[ "$count" == 0 ]]; then
    adb -s "$serial" exec-out screencap -p >"$out/screens/$name-final.png"
    echo "Flow $name took no screenshots; saved the final screen as $name-final.png"
  fi
done
exit "$failed"
