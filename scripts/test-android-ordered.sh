#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

exec bash scripts/test-android.sh \
  android-lock-suite \
  android-lock-006-suite \
  android-rem-editor-suite
