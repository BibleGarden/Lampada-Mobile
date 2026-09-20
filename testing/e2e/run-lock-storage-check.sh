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
# Предусловия: защита включена пином 123456 (прогон ios-lock-009a или ручное
# включение); флоу ios-lock-011-pin-entry.yaml генерирует ввод.
set -euo pipefail
cd "$(dirname "$0")/../.."
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C
PIN=${1:-123456}
CONTAINER=$(xcrun simctl get_app_container "$UDID" twinkler data)

echo "== 1. Поиск строки пина в контейнере (Documents, Library, tmp)"
HITS=$(grep -r -l "$PIN" "$CONTAINER/Documents" "$CONTAINER/Library" "$CONTAINER/tmp" 2>/dev/null | grep -v "Keychains/keychain" || true)
if [ -n "$HITS" ]; then
  echo "FAIL: пин найден в: $HITS"; exit 1
fi
echo "OK: строка пина в файлах контейнера не найдена"

echo "== 2. Ключи lampada.lock.* в Keychain"
KEYCHAIN=$(ls "$CONTAINER/Library/Keychains/"*.keychain* 2>/dev/null | head -1)
KEYS=$(strings "$KEYCHAIN" | grep -o "lampada\.lock\.[a-z]*" | sort -u)
echo "$KEYS"
UNEXPECTED=$(echo "$KEYS" | grep -v -E "lampada\.lock\.(salt|hash|enabled|biometrics|length)" || true)
if [ -n "$UNEXPECTED" ]; then
  echo "FAIL: неожиданные ключи: $UNEXPECTED"; exit 1
fi
echo "OK: только salt/hash/enabled/biometrics/length"

echo "== 3. Логи устройства за время ввода пина"
LOG=/tmp/lock011-device.log
: > "$LOG"
xcrun simctl spawn "$UDID" log stream --style compact > "$LOG" 2>&1 &
LPID=$!
sleep 2
export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
maestro test testing/e2e/ios-lock-011-pin-entry.yaml > /tmp/lock-011-flow.log 2>&1 || { kill $LPID; echo "FAIL: флоу ввода пина упал"; exit 1; }
sleep 2
kill $LPID || true
if grep -q "$PIN" "$LOG"; then
  echo "FAIL: строка пина есть в системном логе:"
  grep "$PIN" "$LOG" | head -3
  exit 1
fi
echo "OK: строка пина в системном логе не найдена ($(wc -l < "$LOG" | tr -d ' ') строк проверено)"
echo "== LOCK-011: все проверки пройдены"
