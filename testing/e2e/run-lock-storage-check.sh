#!/bin/bash
# LOCK-011: the PIN is never stored or logged; the Keychain holds only the
# salt, hash, length and flags.
#
# Checks:
#   1. The app container contains no PIN string (Documents/Library/tmp).
#   2. The Keychain contains only lampada.lock.* keys (salt/hash/enabled/
#      biometrics/length) — by key names, no decryption needed.
#   3. The device system log during PIN entry (valid and invalid) contains
#      no PIN string.
#
# Preconditions: protection off; the app installed.
# The script enables PIN 123456 itself, runs the checks and removes protection
# on any exit, including after a failed check.
#
# By default evidence goes to a temporary folder (not the repository).
# To keep it for a report, pass EVIDENCE_DIR=testing/evidence/<date>-<topic>.
set -euo pipefail
cd "$(dirname "$0")/../.."
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
PIN=${1:-123456}
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
DEV=(--device "$UDID")

PIN_ON=0
LPID=
disable_test_pin() {
  local log="$EVIDENCE/ios-lock-cleanup.log"
  maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-cleanup.yaml > "$log" 2>&1 ||
    { echo "FAIL: PIN cleanup flow failed, see $log" >&2; return 1; }
  PIN_ON=0
}
# Any exit stops the system log stream and, while the PIN is on,
# removes it with the tracked cleanup flow. The run's exit code is preserved.
cleanup() {
  local status=$?
  if [ -n "$LPID" ] && kill -0 "$LPID" 2>/dev/null; then
    kill "$LPID"
    wait "$LPID" || true
  fi
  if [ "$PIN_ON" = 1 ]; then
    echo "== Cleanup: removing the test PIN" >&2
    if ! disable_test_pin && [ "$status" = 0 ]; then
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "== Enabling protection with PIN $PIN"
PREPARE_LOG="$EVIDENCE/ios-lock-011-prepare.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-prepare.yaml > "$PREPARE_LOG" 2>&1 || { echo "FAIL: PIN preparation, see $PREPARE_LOG" >&2; exit 1; }
PIN_ON=1

CONTAINER=$(xcrun simctl get_app_container "$UDID" twinkler data)

echo "== 1. Searching the container for the PIN string (Documents, Library, tmp)"
HITS=$(grep -r -l "$PIN" "$CONTAINER/Documents" "$CONTAINER/Library" "$CONTAINER/tmp" 2>/dev/null | grep -v "Keychains/keychain" || true)
if [ -n "$HITS" ]; then
  echo "FAIL: PIN found in: $HITS"; exit 1
fi
echo "OK: PIN string not found in container files"

echo "== 2. Protection keys in the Keychain"
# The simulator Keychain is device-level: data/Library/Keychains/
# keychain-2-debug.db. Item names (acct/svce) in the database are hashed
# (SHA-1), so we check two things: the number of records in the app group
# (exactly as many keys as lib/lock.ts writes: salt, hash, length,
# enabled — plus biometrics when on) and the absence of the PIN in plain
# text in the database and WAL.
KEYCHAIN=~/Library/Developer/CoreSimulator/Devices/"$UDID"/data/Library/Keychains/keychain-2-debug.db
[ -f "$KEYCHAIN" ] || { echo "FAIL: keychain not found"; exit 1; }
GROUP=$(sqlite3 "file:$KEYCHAIN?mode=ro" "SELECT DISTINCT agrp FROM genp WHERE agrp LIKE '%twinkler%'")
echo "   app group: $GROUP"
ITEMS=$(sqlite3 "file:$KEYCHAIN?mode=ro" "SELECT COUNT(*) FROM genp WHERE agrp='$GROUP'")
echo "   records in group: $ITEMS (expected 4 without biometrics / 5 with biometrics)"
if [ "$ITEMS" -lt 4 ] || [ "$ITEMS" -gt 5 ]; then
  echo "FAIL: unexpected number of keys: $ITEMS"; exit 1
fi
if grep -aq "$PIN" "$KEYCHAIN" "${KEYCHAIN}-wal"; then
  echo "FAIL: PIN string found in plain text in the Keychain"; exit 1
fi
echo "OK: only service keys; no PIN in plain text"

echo "== 3. Device logs during PIN entry"
LOG="$EVIDENCE/ios-lock-011-device.log"
: > "$LOG"
xcrun simctl spawn "$UDID" log stream --style compact > "$LOG" 2>&1 &
LPID=$!
sleep 2
FLOW_LOG="$EVIDENCE/ios-lock-011-pin-entry.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-pin-entry.yaml > "$FLOW_LOG" 2>&1 || { echo "FAIL: PIN entry flow, see $FLOW_LOG" >&2; exit 1; }
sleep 2
kill "$LPID"
wait "$LPID" || true
LPID=
if grep -q "$PIN" "$LOG"; then
  echo "FAIL: PIN string is present in the system log:"
  grep "$PIN" "$LOG" | head -3
  exit 1
fi
echo "OK: PIN string not found in the system log ($(wc -l < "$LOG" | tr -d ' ') lines checked)"

echo "== Removing protection"
disable_test_pin
echo "== LOCK-011: all checks passed"
