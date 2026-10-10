#!/bin/bash
# LOCK-008: подготовка и снимок переключателя приложений Device Hub.
# Между prepare и capture откройте App Switcher двойным нажатием Home
# в Device Hub. Снимок требует визуальной проверки шторки приватности.
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
