#!/bin/bash
# Stub-фаза e2e (задача 86cbj95j4): прогон флоу, требующих stub-сервера.
#
# Предусловия (выполняются вручную до запуска):
#   1. Сборка с EXPO_PUBLIC_API_URL=http://localhost:9085 и
#      EXPO_PUBLIC_FORCE_SESSION_ERROR=1:
#        EXPO_PUBLIC_API_URL=http://localhost:9085 \
#        EXPO_PUBLIC_FORCE_SESSION_ERROR=1 \
#        npx expo run:ios --configuration Release --no-bundler
#   2. Stub запущен: npm run scripture:stub
#   3. Симулятор «Pray Smoke iPhone 17 Pro» загружен.
# По умолчанию доказательства идут во временную папку (не в репозиторий).
# Для сохранения в отчёт передайте EVIDENCE_DIR=testing/evidence/<дата>-<тема>.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
STUB=http://localhost:9085
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C
control() { curl -s -X POST "$STUB/__control" -d "$1" > /dev/null; }
step() { echo "== $1"; }

step "UPDATE soft"
control '{"version":{"update_type":"soft","latest_version":"9.9.9","store_url":"https://example.com/lampada","message":{"ru":"Доступно обновление. Обнови, пожалуйста.","en":"Update available.","uk":"Доступне оновлення."}}}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-update-soft.yaml

step "UPDATE hard"
control '{"version":{"update_type":"hard","latest_version":"9.9.9","store_url":"https://example.com/lampada","message":{"ru":"Обнови Лампаду, чтобы продолжить.","en":"Update required.","uk":"Онови застосунок."}}}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-update-hard.yaml
control '{"version":{"update_type":"none","latest_version":"1.0.23","message":null}}'

step "JRN-010/011: транскрипция успешна"
control '{"transcription":"ok"}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-010-011-transcribe.yaml

step "JRN-012a: ошибка транскрипции"
control '{"transcription":"fail"}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-012a-transcription-error.yaml

step "JRN-012b: повтор сохраняет текст"
control '{"transcription":"ok"}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-012b-transcription-retry.yaml

step "JRN-013a: закрытие во время расшифровки"
control '{"transcription":"delay"}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-013a-close-during.yaml

step "JRN-013b: удаление во время расшифровки"
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-jrn-013b-delete-during.yaml
control '{"transcription":"ok"}'

step "Проверка БД: осиротевшие записи отсутствуют"
DB="$(xcrun simctl get_app_container "$UDID" twinkler data)/Documents/SQLite/lampada.db"
ORPHANS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM recordings r WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = r.session_id)")
[ "$ORPHANS" = "0" ] || { echo "FAIL: осиротевших записей: $ORPHANS"; exit 1; }
echo "OK: осиротевших записей нет"

step "AI-late: ответ ИИ с задержкой"
control '{"questionDelayMs":15000}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage05-ai-late-stub.yaml
control '{"questionDelayMs":0}'

step "SCR-001: навигация по отрывкам"
control '{"resetScripture":true}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage06-scr-001-navigation.yaml

step "SCR-002a/b: избранное переживает перезапуск"
control '{"resetScripture":true}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage06-scr-002a-favorite-relaunch.yaml
control '{"resetScripture":true}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage06-scr-002b-favorite-relaunch.yaml

step "Legacy-избранное: миграция"
bash testing/e2e/seed-legacy-favorites.sh
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-scripture-legacy-favorites.yaml

step "STG: ошибка входа через хук и живой повтор"
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-stage03-start-sqlite-lock.yaml

step "RPT-001/002: жалобы на вопрос и отрывок"
control '{"contentReports":"ok"}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-rpt-001-002.yaml

step "RPT-003: сбой и повтор (fail-once)"
control '{"contentReports":"fail-once"}'
maestro test --test-output-dir "$EVIDENCE" testing/e2e/ios-rpt-003.yaml
control '{"contentReports":"ok"}'

echo "== Stub-фаза завершена. Доказательства: $EVIDENCE"
echo "== Не забудьте переустановить обычную Release-сборку (без override)!"
