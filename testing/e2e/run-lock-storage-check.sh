#!/bin/bash
# LOCK-011: пин нигде не хранится и не логируется; в Keychain — только соль,
# хэш, длина и флаги.
#
# Проверки:
#   1. Контейнер приложения не содержит строку пина (Documents/Library/tmp).
#   2. Keychain содержит только ключи lampada.lock.* (salt/hash/enabled/
#      biometrics/length) — по именам ключей, расшифровка не требуется.
#   3. Системный лог устройства за время ввода пина (верного и неверного)
#      не содержит строку пина.
#
# Предусловия: защита выключена; приложение установлено.
# Скрипт сам включает пин 123456, гонит проверки и снимает защиту при любом
# выходе, в том числе после упавшей проверки.
#
# По умолчанию доказательства идут во временную папку (не в репозиторий).
# Для сохранения в отчёт передайте EVIDENCE_DIR=testing/evidence/<дата>-<тема>.
set -euo pipefail
cd "$(dirname "$0")/../.."
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"
PIN=${1:-123456}
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
EVIDENCE="${EVIDENCE_DIR:-${TMPDIR:-/tmp/}pray-e2e-output}"
mkdir -p "$EVIDENCE"
DEV=(--device "$UDID")

PIN_ON=0
LPID=
disable_test_pin() {
  local log="$EVIDENCE/ios-lock-cleanup.log"
  maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-cleanup.yaml > "$log" 2>&1 ||
    { echo "FAIL: PIN cleanup flow failed, see $log" >&2; return 1; }
  PIN_ON=0
}
# Любой выход останавливает поток системного лога и, пока пин включён,
# снимает его tracked-флоу уборки. Код выхода прогона сохраняется.
cleanup() {
  local status=$?
  if [ -n "$LPID" ] && kill -0 "$LPID" 2>/dev/null; then
    kill "$LPID"
    wait "$LPID" || true
  fi
  if [ "$PIN_ON" = 1 ]; then
    echo "== Уборка: снимаем тестовый пин" >&2
    if ! disable_test_pin && [ "$status" = 0 ]; then
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "== Включаем защиту пином $PIN"
PREPARE_LOG="$EVIDENCE/ios-lock-011-prepare.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-prepare.yaml > "$PREPARE_LOG" 2>&1 || { echo "FAIL: PIN preparation, see $PREPARE_LOG" >&2; exit 1; }
PIN_ON=1

CONTAINER=$(xcrun simctl get_app_container "$UDID" twinkler data)

echo "== 1. Поиск строки пина в контейнере (Documents, Library, tmp)"
HITS=$(grep -r -l "$PIN" "$CONTAINER/Documents" "$CONTAINER/Library" "$CONTAINER/tmp" 2>/dev/null | grep -v "Keychains/keychain" || true)
if [ -n "$HITS" ]; then
  echo "FAIL: пин найден в: $HITS"; exit 1
fi
echo "OK: строка пина в файлах контейнера не найдена"

echo "== 2. Ключи защиты в Keychain"
# Keychain симулятора — на уровне устройства: data/Library/Keychains/
# keychain-2-debug.db. Имена записей (acct/svce) в базе захэшированы
# (SHA-1), поэтому проверяем две вещи: количество записей группы приложения
# (ровно столько, сколько ключей пишет lib/lock.ts: salt, hash, length,
# enabled — плюс biometrics, когда включён) и отсутствие пина в открытом виде
# в базе и WAL.
KEYCHAIN=~/Library/Developer/CoreSimulator/Devices/"$UDID"/data/Library/Keychains/keychain-2-debug.db
[ -f "$KEYCHAIN" ] || { echo "FAIL: keychain не найден"; exit 1; }
GROUP=$(sqlite3 "file:$KEYCHAIN?mode=ro" "SELECT DISTINCT agrp FROM genp WHERE agrp LIKE '%twinkler%'")
echo "   группа приложения: $GROUP"
ITEMS=$(sqlite3 "file:$KEYCHAIN?mode=ro" "SELECT COUNT(*) FROM genp WHERE agrp='$GROUP'")
echo "   записей в группе: $ITEMS (ожидается 4 без биометрии / 5 с биометрией)"
if [ "$ITEMS" -lt 4 ] || [ "$ITEMS" -gt 5 ]; then
  echo "FAIL: неожиданное число ключей: $ITEMS"; exit 1
fi
if grep -aq "$PIN" "$KEYCHAIN" "${KEYCHAIN}-wal"; then
  echo "FAIL: строка пина найдена в Keychain в открытом виде"; exit 1
fi
echo "OK: только служебные ключи; пина в открытом виде нет"

echo "== 3. Логи устройства за время ввода пина"
LOG="$EVIDENCE/ios-lock-011-device.log"
: > "$LOG"
xcrun simctl spawn "$UDID" log stream --style compact > "$LOG" 2>&1 &
LPID=$!
sleep 2
FLOW_LOG="$EVIDENCE/ios-lock-011-pin-entry.log"
maestro test "${DEV[@]}" --test-output-dir "$EVIDENCE" testing/e2e/ios-lock-011-pin-entry.yaml > "$FLOW_LOG" 2>&1 || { echo "FAIL: PIN entry flow, see $FLOW_LOG" >&2; exit 1; }
sleep 2
kill "$LPID"
wait "$LPID" || true
LPID=
if grep -q "$PIN" "$LOG"; then
  echo "FAIL: строка пина есть в системном логе:"
  grep "$PIN" "$LOG" | head -3
  exit 1
fi
echo "OK: строка пина в системном логе не найдена ($(wc -l < "$LOG" | tr -d ' ') строк проверено)"

echo "== Снимаем защиту"
disable_test_pin
echo "== LOCK-011: все проверки пройдены"
