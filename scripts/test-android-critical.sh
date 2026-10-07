#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

device="${ANDROID_TEST_DEVICE:-emulator-5554}"
run_dir="${ANDROID_TEST_OUTPUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp/}lampada-android-critical.XXXXXX")}"
mkdir -p "$run_dir"

command -v adb >/dev/null
command -v maestro >/dev/null
npm run env:check:local > "$run_dir/environment.log" 2>&1
[[ "$(adb -s "$device" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]] || { echo 'Android has not booted' >&2; exit 1; }
adb -s "$device" shell dumpsys package com.nf404.twinkler > "$run_dir/installed-package.log"
grep -q 'versionName=' "$run_dir/installed-package.log" || { echo 'Lampada is not installed' >&2; exit 1; }
if grep -q DEBUGGABLE "$run_dir/installed-package.log"; then
  echo 'Install the standalone Release build before testing; Debug warnings can intercept taps.' >&2
  exit 1
fi
locale="$(adb -s "$device" shell settings get system system_locales | tr -d '\r')"
[[ "$locale" == ru-RU* ]] || { echo "Expected Russian as the primary Android locale, got $locale" >&2; exit 1; }

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
flows=(
  android-stage06-jrn-001-empty-history
  android-stage03-setup-start
  android-stage03-navigation
  android-stage03-session-finite
  android-stage04-answers-text
  android-stage06-end-001-finish-without-takeaway
  android-stage06-end-002-finish-with-takeaway
  android-privacy-consent-first-use
  android-smoke-full
  android-smoke-full-relaunch
)

printf 'flow\texit\n' > "$run_dir/results.tsv"
echo "Android test output: $run_dir"
for flow in "${flows[@]}"; do
  echo "Starting $flow"
  # Relaunch must immediately follow smoke-full: it verifies the saved data.
  set +e
  maestro --device "$device" test --test-output-dir "$run_dir/$flow" \
    "testing/android-e2e/$flow.yaml" > "$run_dir/$flow.log" 2>&1
  result=$?
  set -e
  printf '%s\t%s\n' "$flow" "$result" >> "$run_dir/results.tsv"
  printf '%s\n' "$result" > "$run_dir/$flow.exit"
  echo "$flow exit=$result"
  if [[ "$result" -ne 0 ]]; then
    echo "Stopped at first failure; full log: $run_dir/$flow.log" >&2
    exit "$result"
  fi
done
echo 'All 10 Android critical scenarios passed.'
