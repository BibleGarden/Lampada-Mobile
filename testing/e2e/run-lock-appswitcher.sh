#!/bin/bash
# LOCK-008: Device Hub app switcher preparation and snapshot.
# Between prepare and capture, open the App Switcher with a double Home
# press in Device Hub. The snapshot requires visual inspection of the privacy curtain.
set -euo pipefail
cd "$(dirname "$0")/../.."
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
case "${1:-}" in
  prepare)
    maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-008-appswitcher.yaml
    echo "Open App Switcher in Device Hub, then run this script with capture."
    ;;
  capture)
    xcrun simctl io "$UDID" screenshot "$EVIDENCE/LOCK-008-app-switcher.png"
    echo "Inspect LOCK-008-app-switcher.png: Lampada must show its privacy curtain."
    ;;
  cleanup)
    maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-cleanup.yaml
    ;;
  *)
    echo "Usage: run-lock-appswitcher.sh prepare|capture|cleanup" >&2
    exit 2
    ;;
esac
