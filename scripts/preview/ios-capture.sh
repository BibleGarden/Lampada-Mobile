#!/usr/bin/env bash
# Installs the built app on the "iPhone 17 Pro" simulator, booting it first, and
# runs the requested preview flows with Maestro. Needs no secrets.
#
# Usage: ios-capture.sh <tooling-dir> <flows-dir> <out-dir> <app-dir> <token>...
#   <app-dir> holds the twinkler.app that ios-build.sh built.
# Writes <out-dir>/screens/*.png and <out-dir>/logs/*.
set -euo pipefail
tooling="${1:?tooling-dir}" flows="${2:?flows-dir}" out="${3:?out-dir}" appdir="${4:?app-dir}"
shift 4
(($#)) || { echo 'No preview screens requested.' >&2; exit 2; }
# shellcheck source=screens.sh
source "$tooling/scripts/preview/screens.sh"
# shellcheck source=phases.sh
source "$tooling/scripts/preview/phases.sh"
mkdir -p "$out/screens" "$out/logs"
logs="$(cd "$out/logs" && pwd)"

# No mapfile: macOS ships bash 3.2.
resolved="$(resolve_flows ios "$tooling" "$flows" "$@")"
[[ -n "$resolved" ]] || { echo 'None of the requested screens applies to iOS.' >&2; exit 2; }
flow_list=()
while IFS= read -r line; do flow_list+=("$line"); done <<<"$resolved"

udid="$(ios_simulator_udid)"
phase_run simulator-boot bash -c 'xcrun simctl boot "$1" 2>/dev/null || true; xcrun simctl bootstatus "$1" -b' _ "$udid" >"$logs/bootstatus.log" 2>&1
[[ -d "$appdir/twinkler.app" ]] || { echo "No built app in $appdir (twinkler.app)." >&2; exit 1; }
phase_run app-install xcrun simctl install "$udid" "$appdir/twinkler.app"
# The same status bar in every run.
xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4
xcrun simctl get_app_container "$udid" twinkler app >/dev/null \
  || { echo 'The app (twinkler) is not installed on the simulator.' >&2; exit 1; }

# A fresh runner builds and starts the XCTest driver cold: 3 minutes were not
# always enough ("iOS driver not ready in time").
export MAESTRO_DRIVER_STARTUP_TIMEOUT=480000
# A flow that fails is run again, twice at most: every flow starts from a cleared
# app, so a rerun is a fresh try. The reflect flow sometimes presses the hold
# button of the prayer screen while the screen still says "Preparing a question"
# (the real server answers slowly), and then it fails at session-title. The log
# and the failure screenshot of every failed attempt are kept in the logs.
max_attempts=3
failed=0
for entry in "${flow_list[@]}"; do
  name="${entry%%$'\t'*}"
  path="${entry#*$'\t'}"
  echo "== flow $name ($path)"
  passed=0
  attempt=1
  while ((attempt <= max_attempts)); do
    suffix=""
    ((attempt == 1)) || suffix="-attempt$attempt"
    run="$logs/maestro-$name$suffix"
    mkdir -p "$run"
    if (cd "$run" && maestro --device "$udid" test --test-output-dir "$run" "$path") >"$logs/flow-$name$suffix.log" 2>&1; then
      passed=1
      break
    fi
    echo "Flow $name FAILED (attempt $attempt of $max_attempts):" >&2
    tail -40 "$logs/flow-$name$suffix.log" >&2
    xcrun simctl io "$udid" screenshot "$logs/$name-failure$suffix.png" >/dev/null 2>&1 || true
    attempt=$((attempt + 1))
  done
  if ((passed == 0)); then
    failed=1
    continue
  fi
  ((attempt == 1)) || echo "Flow $name passed on attempt $attempt."
  count="$(collect_screenshots "$run" "$out/screens")"
  if [[ "$count" == 0 ]]; then
    xcrun simctl io "$udid" screenshot "$out/screens/$name-final.png"
    echo "Flow $name took no screenshots; saved the final screen as $name-final.png"
  fi
done
exit "$failed"
