#!/bin/bash
# Группа iPad: флоу ios-ipad-*.yaml (тег `ipad`, повороты — на iPhone
# приложение только портретное) и ANS-023, который не привязан к устройству.
#
# Устройство: UDID=<udid>, по умолчанию симулятор «Pray iPad2».
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray iPad2")}"

maestro --device "$UDID" test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" \
  testing/e2e/ios-ipad-*.yaml testing/e2e/ios-ans-023-recordings-actions.yaml
