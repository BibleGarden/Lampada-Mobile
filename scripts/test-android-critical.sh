#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

device="${ANDROID_TEST_DEVICE:-emulator-5554}"
[[ "$device" == emulator-* ]] || {
  echo 'Critical fixtures clear app data; physical devices are prohibited.' >&2
  exit 2
}

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

export ANDROID_TEST_OUTPUT_DIR="${ANDROID_TEST_OUTPUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp/}lampada-android-critical.XXXXXX")}"
bash scripts/test-android.sh "${flows[@]}"
echo 'All 10 Android critical scenarios passed.'
# Native geometry is part of the build gate, not an optional visual check.
python3 -m scripts.run_keyboard_contract --device "$device" \
  --mode docked --output "${ANDROID_TEST_OUTPUT_DIR:?}/keyboard-contract-docked"

python3 scripts/run-keyboard-resize-contract.py --device "$device" \
  --output "${ANDROID_TEST_OUTPUT_DIR:?}/keyboard-window-resize"
