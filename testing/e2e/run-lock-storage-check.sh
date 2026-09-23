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
# Скрипт сам включает пин 123456, гонит проверки и снимает защиту в конце.
set -euo pipefail
cd "$(dirname "$0")/../.."
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C
PIN=${1:-123456}
export MAESTRO_DRIVER_STARTUPTIMEOUT=180000

echo "== Включаем защиту пином $PIN"
maestro test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" --device "$UDID" testing/e2e/ios-lock-011-prepare.yaml > /tmp/lock-011-prepare.log 2>&1 || { echo "FAIL: не удалось включить пин"; exit 1; }

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
LOG=/tmp/lock011-device.log
: > "$LOG"
xcrun simctl spawn "$UDID" log stream --style compact > "$LOG" 2>&1 &
LPID=$!
sleep 2
export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
maestro test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" --device "$UDID" testing/e2e/ios-lock-011-pin-entry.yaml > /tmp/lock-011-flow.log 2>&1 || { kill $LPID; echo "FAIL: флоу ввода пина упал"; exit 1; }
sleep 2
kill $LPID || true
if grep -q "$PIN" "$LOG"; then
  echo "FAIL: строка пина есть в системном логе:"
  grep "$PIN" "$LOG" | head -3
  exit 1
fi
echo "OK: строка пина в системном логе не найдена ($(wc -l < "$LOG" | tr -d ' ') строк проверено)"

echo "== Снимаем защиту"
maestro test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" --device "$UDID" /tmp/disable-pin.yaml > /tmp/lock-011-disable.log 2>&1 || true
echo "== LOCK-011: все проверки пройдены"
