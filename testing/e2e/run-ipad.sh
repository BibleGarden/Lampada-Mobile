#!/bin/bash
# iPad group: the ios-ipad-*.yaml flows (`ipad` tag, rotations — on iPhone
# the app is portrait-only) plus ANS-023, which is not device-bound.
#
# Device: UDID=<udid>, default simulator "Pray iPad2".
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray iPad2")}"

maestro --device "$UDID" test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" \
  testing/e2e/ios-ipad-*.yaml testing/e2e/ios-ans-023-recordings-actions.yaml
