#!/bin/bash
# E2E stub phase (task 86cbj95j4): runs the flows that need the stub server.
#
# Preconditions (done manually before launch):
#   1. Build with EXPO_PUBLIC_API_URL=http://localhost:9085 and
#      EXPO_PUBLIC_FORCE_SESSION_ERROR=1:
#        EXPO_PUBLIC_API_URL=http://localhost:9085 \
#        EXPO_PUBLIC_FORCE_SESSION_ERROR=1 \
#        npx expo run:ios --configuration Release --no-bundler
#   2. Stub running: npm run scripture:stub
#   3. Simulator "Pray Smoke iPhone 17 Pro" booted.
# By default evidence goes to a temporary folder (not the repository).
# To keep it for a report, pass EVIDENCE_DIR=testing/evidence/<date>-<topic>.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
STUB=http://localhost:9085
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
control() { curl -s -X POST "$STUB/__control" -d "$1" > /dev/null; }
step() { echo "== $1"; }

step "UPDATE soft"
control '{"version":{"update_type":"soft","latest_version":"9.9.9","store_url":"https://example.com/lampada","message":{"ru":"Доступно обновление. Обнови, пожалуйста.","en":"Update available.","uk":"Доступне оновлення."}}}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-update-soft.yaml

step "UPDATE hard"
control '{"version":{"update_type":"hard","latest_version":"9.9.9","store_url":"https://example.com/lampada","message":{"ru":"Обнови Лампаду, чтобы продолжить.","en":"Update required.","uk":"Онови застосунок."}}}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-update-hard.yaml
control '{"version":{"update_type":"none","latest_version":"1.0.23","message":null}}'

step "JRN-010/011: transcription succeeds"
control '{"transcription":"ok"}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-010-011-transcribe.yaml

step "JRN-012a: transcription error"
control '{"transcription":"fail"}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-012a-transcription-error.yaml

step "JRN-012b: retry saves the text"
control '{"transcription":"ok"}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-012b-transcription-retry.yaml

step "JRN-013a: closing during transcription"
control '{"transcription":"delay"}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-013a-close-during.yaml

step "JRN-013b: deleting during transcription"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-013b-delete-during.yaml
step "ANS-013: hint and saving during transcription"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage04-ans-013-save-in-flight.yaml
control '{"transcription":"ok"}'

step "DB check: no orphaned records"
DB="$(xcrun simctl get_app_container "$UDID" twinkler data)/Documents/SQLite/lampada.db"
ORPHANS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM recordings r WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = r.session_id)")
[ "$ORPHANS" = "0" ] || { echo "FAIL: orphaned records: $ORPHANS"; exit 1; }
echo "OK: no orphaned records"

step "AI-late: AI answer with a delay"
control '{"questionDelayMs":15000}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage05-ai-late-stub.yaml
control '{"questionDelayMs":0}'

step "SCR-001: scripture navigation"
control '{"resetScripture":true}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage06-scr-001-navigation.yaml

step "SCR-002a/b: favorite survives a restart"
control '{"resetScripture":true}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage06-scr-002a-favorite-relaunch.yaml
control '{"resetScripture":true}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage06-scr-002b-favorite-relaunch.yaml

step "Legacy favorites: migration"
bash testing/e2e/seed-legacy-favorites.sh
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-scripture-legacy-favorites.yaml

step "STG: login error via hook and live retry"
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage03-start-sqlite-lock.yaml

step "RPT-001/002: reports on a question and a passage"
control '{"contentReports":"ok"}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-rpt-001-002.yaml

step "RPT-003: failure and retry (fail-once)"
control '{"contentReports":"fail-once"}'
maestro --device "$UDID" test --test-output-dir "$EVIDENCE" testing/e2e/ios-rpt-003.yaml
control '{"contentReports":"ok"}'

echo "== Stub phase finished. Evidence: $EVIDENCE"
echo "== Do not forget to reinstall the regular Release build (without overrides)!"
