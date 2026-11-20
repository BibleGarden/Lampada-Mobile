#!/bin/bash
# Runs the REM firing flows (REM-004/005/006/008).
#
# Self-contained: does a clean install and runs REM-001 (notification
# permission), so the initial state is always known — the rule has a single
# 09:00 row, the toggle is on. Skip the reset with: SKIP_RESET=1.
#
# Scenario: sets times now+4min and now+9min (multiples of 5), runs the flows.
# Notification firing is captured via device screenshots: the banner lives in
# SpringBoard and never reaches the app's accessibility hierarchy (Maestro).
# By default evidence goes to a temporary folder (not the repository).
# To keep it for a report, pass EVIDENCE_DIR=testing/evidence/<date>-<topic>.
set -euo pipefail
cd "$(dirname "$0")/../.."

HELPER=/tmp/rem-set-time.yaml
LOCK=/tmp/pray-rem-fire.lock
if ! mkdir "$LOCK"; then
  echo "Reminder runner is already active or left a stale lock: $LOCK" >&2
  exit 1
fi
helper_created=0
cleanup() {
  local status=$?
  trap - EXIT
  if [ "$helper_created" = 1 ] && { [ -e "$HELPER" ] || [ -L "$HELPER" ]; }; then
    rm -- "$HELPER" || status=1
  fi
  rmdir "$LOCK" || status=1
  exit "$status"
}
trap cleanup EXIT
if [ -e "$HELPER" ] || [ -L "$HELPER" ]; then
  echo "Stale reminder helper blocks the run: $HELPER" >&2
  exit 1
fi

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
APP="${APP:-$HOME/Library/Developer/Xcode/DerivedData/Lampada-gehztyibhocyfdajdtvhehendfdc/Build/Products/Release-iphonesimulator/Lampada.app}"

if [ "${SKIP_RESET:-0}" != "1" ]; then
  echo "== Clean install + REM-001 (permission)"
  xcrun simctl uninstall "$UDID" twinkler
  xcrun simctl install "$UDID" "$APP"
  maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-rem-001-permission-allow.yaml
fi

# now+DELAY minutes, rounded UP to a multiple of 5. Prints "HH:MM".
ceil_time() {
  local delay=$1
  local total=$((10#$(date +%H) * 60 + 10#$(date +%M) + delay))
  local rounded=$(( (total + 4) / 5 * 5 % 1440 ))
  printf '%02d:%02d' $((rounded / 60)) $((rounded % 60))
}
# The first row's current time after a reset is always the 09:00 default.
ROW0="${INIT0:-09:00}"
# Seconds from "now" until "HH:MM + pad".
sleep_until() {
  local t=$1 pad=$2
  local now_s=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
  local target_s=$((10#${t:0:2} * 3600 + 10#${t:3:2} * 60 + pad))
  if (( target_s <= now_s )); then target_s=$((target_s + 86400)); fi
  local remaining=$((target_s - now_s))
  if (( remaining > 900 )); then
    echo "Reminder target $t is already past; refusing to wait until tomorrow" >&2
    return 1
  fi
  sleep "$remaining"
}
shot() { xcrun simctl io "$UDID" screenshot "$EVIDENCE/$1.png" > /dev/null 2>&1; echo "  📸 $1"; }

T1=$(ceil_time 4)
T2=$(ceil_time 9)
echo "== REM-004/011/013: target $T1 (row now at $ROW0)"
helper_created=1
node testing/e2e/gen-rem-set-time.mjs --init "$ROW0" "$T1" > "$HELPER"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/reminder-fire/ios-rem-fire.yaml
sleep_until "$T1" 4
shot REM-004-011-013-banner

INIT1=$T1
T1=$(ceil_time 4)
T2=$(ceil_time 9)
echo "== REM-005: targets $T1, $T2 (initial row $INIT1)"
node testing/e2e/gen-rem-set-time.mjs --init "$INIT1" "$T1" "$T2" > "$HELPER"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" -e REM_T1="$T1" -e REM_T2="$T2" testing/reminder-fire/ios-rem-005-two-times.yaml
sleep_until "$T1" 4
shot REM-005-first
sleep_until "$T2" 4
shot REM-005-second

echo "== REM-006: restart"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-rem-006-restart.yaml

# REM-008: the first row is now at $T1. Shift it forward, toggle off.
PREV=$T1
T1=$(ceil_time 4)
echo "== REM-008: target $T1, toggling off"
node testing/e2e/gen-rem-set-time.mjs --init "$PREV" "$T1" > "$HELPER"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/reminder-fire/ios-rem-008-toggle-off.yaml
sleep_until "$T1" 4
shot REM-008-no-banner

echo "== Done. Evidence: $EVIDENCE"
