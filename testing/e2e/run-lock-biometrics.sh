#!/bin/bash
# Runs LOCK-009/010 (biometrics).
#
# By default the run goes on Pray SE with Touch ID. Simulator control
# via BiometricKit (notifyutil):
#   enrollment — com.apple.BiometricKit.enrollmentChanged state (0/1)
#   match       — com.apple.BiometricKit_Sim.fingerTouch.match
#   no match  — com.apple.BiometricKit_Sim.fingerTouch.nomatch
# Maestro cannot send these signals from a flow: the flow sleeps on an
# evalScript sleep while the script posts the signal.
#
# Environment: UDID (default simulator "Pray SE"), SIG
# (default fingerTouch; pearl on a Face ID device).
# By default evidence goes to a temporary folder (not the repository).
# To keep it for a report, pass EVIDENCE_DIR=testing/evidence/<date>-<topic>.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray SE")}"
SIG="${SIG:-fingerTouch}"
DEV=(--device "$UDID")
BIO="com.apple.BiometricKit_Sim.$SIG"

signal() { xcrun simctl spawn "$UDID" notifyutil -p "$1"; }

# Explicit enrollment state instead of the deprecated toggle signal.
set_enrolled() {
  xcrun simctl spawn "$UDID" notifyutil -s com.apple.BiometricKit.enrollmentChanged "$1"
  xcrun simctl spawn "$UDID" notifyutil -p com.apple.BiometricKit.enrollmentChanged
}

# Any exit from the script, including Ctrl-C, first stops the background
# Maestro (in non-interactive bash it gets no SIGINT and would otherwise keep
# controlling the device in parallel with cleanup). Then, while the PIN is on
# (after preparation and until a successful 010), the tracked cleanup flow
# removes it: otherwise a failed 009a…010 leaves the simulator with a test
# PIN. Without a biometrics sample the app immediately shows the PIN keypad
# (as in LOCK-010), so cleanup first clears enrollment. The run's exit code
# is preserved.
PIN_MAY_BE_ON=0
WORKER=
cleanup_pin() {
  local status=$?
  if [ -n "$WORKER" ] && kill -0 "$WORKER" 2>/dev/null; then
    kill "$WORKER"
    wait "$WORKER" || true
  fi
  if [ "$PIN_MAY_BE_ON" = 1 ]; then
    local log="$EVIDENCE/ios-lock-cleanup.log"
    echo "== Cleanup: removing the test PIN" >&2
    if ! { set_enrolled 0 && maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-cleanup.yaml > "$log" 2>&1; }; then
      echo "FAIL: PIN cleanup flow failed (if LOCK-010 got past disabling the PIN, it is already off), see $log" >&2
      [ "$status" = 0 ] && status=1
    fi
  fi
  exit "$status"
}
trap cleanup_pin EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

set_enrolled 1

echo "== Preparation: enabling PIN 123456"
PREPARE_LOG="$EVIDENCE/ios-lock-011-prepare.log"
# Preparation enables the PIN as its last step and verifies it: if it fails,
# the PIN is off (or was on before the run, contrary to the precondition), no cleanup needed.
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-prepare.yaml > "$PREPARE_LOG" 2>&1 || { echo "FAIL: PIN preparation, see $PREPARE_LOG" >&2; exit 1; }
PIN_MAY_BE_ON=1

# The settings screen polls biometrics on mount: the tracked flow reopens
# the settings and scrolls them to the protection section.
NAV_LOG="$EVIDENCE/ios-lock-biometrics-settings.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-biometrics-settings.yaml > "$NAV_LOG" 2>&1 || { echo "FAIL: opening biometric settings, see $NAV_LOG" >&2; exit 1; }
maestro "${DEV[@]}" hierarchy > "$EVIDENCE/biometrics-hierarchy.json"
if ! grep -q 'biometrics-toggle' "$EVIDENCE/biometrics-hierarchy.json"; then
  echo "FAIL: enrolled biometrics are absent from the visible protection section" >&2
  exit 1
fi
echo "   biometrics available"

# The signal is sent after the system dialog is confirmed: the flow enters
# a special pause, visible in the full command log.
# The marker is the exact text of that pause in Maestro output. The
# `evalScript: "java.lang.Thread.sleep(20000)"` step sits in
# ios-lock-009a-enable-biometrics.yaml, ios-lock-009b-cold-start-faceid.yaml and
# ios-lock-009c-refusal.yaml: the duration is changed in all three flows and here.
BIO_WAIT_MARKER='Run java.lang.Thread.sleep(20000)'
run_biometric_flow() {
  local name="$1" result_signal="$2"
  local log="$EVIDENCE/$name.log"
  : > "$log"
  maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" "testing/e2e/$name.yaml" > "$log" 2>&1 &
  WORKER=$!
  local ready=0
  for ((attempt=0; attempt<240; attempt++)); do
    if grep -Fq "$BIO_WAIT_MARKER" "$log"; then
      ready=1
      break
    fi
    if ! kill -0 "$WORKER" 2>/dev/null; then
      wait "$WORKER" || true
      WORKER=
      echo "FAIL: flow exited before its authentication wait: $log" >&2
      return 1
    fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    # A hung flow is stopped by the EXIT trap.
    echo "FAIL: authentication wait timed out: $log" >&2
    return 1
  fi
  echo "Authentication ready: $name"
  signal "$BIO.$result_signal"
  local status=0
  wait "$WORKER" || status=$?
  WORKER=
  if [ "$status" != 0 ]; then
    echo "FAIL: $name, see $log" >&2
    return 1
  fi
}

echo "== LOCK-009a: enabling biometrics"
run_biometric_flow ios-lock-009a-enable-biometrics match

echo "== LOCK-009b: cold start, biometric login"
run_biometric_flow ios-lock-009b-cold-start-faceid match

echo "== LOCK-009c: no match, fallback to PIN login"
run_biometric_flow ios-lock-009c-refusal nomatch

echo "== LOCK-010: samples deleted, login with PIN"
set_enrolled 0
LOCK_010_LOG="$EVIDENCE/ios-lock-010-biometrics-removed.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-010-biometrics-removed.yaml > "$LOCK_010_LOG" 2>&1 || { echo "FAIL: LOCK-010, see $LOCK_010_LOG" >&2; exit 1; }
# 010 disables the PIN together with biometrics: cleanup is no longer needed,
# and enrollment does not need to be restored.
PIN_MAY_BE_ON=0

echo "== Done. Evidence: $EVIDENCE"
