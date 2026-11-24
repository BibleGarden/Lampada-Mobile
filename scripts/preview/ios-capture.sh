#!/usr/bin/env bash
# Runs the requested preview flows with Maestro on the "iPhone 17 Pro"
# simulator that ios-build.sh installed the app on. Needs no secrets.
#
# Usage: ios-capture.sh <tooling-dir> <flows-dir> <out-dir> <token>...
# Writes <out-dir>/screens/*.png and <out-dir>/logs/*.
set -euo pipefail
tooling="${1:?tooling-dir}" flows="${2:?flows-dir}" out="${3:?out-dir}"
shift 3
(($#)) || { echo 'No preview screens requested.' >&2; exit 2; }
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"
mkdir -p "$out/screens" "$out/logs"
logs="$(cd "$out/logs" && pwd)"

# No mapfile: macOS ships bash 3.2.
resolved="$(resolve_flows ios "$tooling" "$flows" "$@")"
[[ -n "$resolved" ]] || { echo 'None of the requested screens applies to iOS.' >&2; exit 2; }
flow_list=()
while IFS= read -r line; do flow_list+=("$line"); done <<<"$resolved"

udid="$(ios_simulator_udid)"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >"$logs/bootstatus.log" 2>&1
# The same status bar in every run.
xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4
xcrun simctl get_app_container "$udid" twinkler app >/dev/null \
  || { echo 'The app (twinkler) is not installed on the simulator; run ios-build.sh first.' >&2; exit 1; }

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
failed=0
for entry in "${flow_list[@]}"; do
  name="${entry%%$'\t'*}"
  path="${entry#*$'\t'}"
  run="$logs/maestro-$name"
  mkdir -p "$run"
  echo "== flow $name ($path)"
  if ! (cd "$run" && maestro --device "$udid" test --test-output-dir "$run" "$path") >"$logs/flow-$name.log" 2>&1; then
    echo "Flow $name FAILED:" >&2
    tail -40 "$logs/flow-$name.log" >&2
    xcrun simctl io "$udid" screenshot "$logs/$name-failure.png" >/dev/null 2>&1 || true
    failed=1
    continue
  fi
  count="$(collect_screenshots "$run" "$out/screens")"
  if [[ "$count" == 0 ]]; then
    xcrun simctl io "$udid" screenshot "$out/screens/$name-final.png"
    echo "Flow $name took no screenshots; saved the final screen as $name-final.png"
  fi
done
exit "$failed"
