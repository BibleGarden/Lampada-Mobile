#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

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

bash scripts/test-android.sh "${flows[@]}"
echo 'All 10 Android critical scenarios passed.'
