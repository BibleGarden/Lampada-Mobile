#!/bin/bash
# Прогон REM-флоу срабатывания (REM-004/005/006/008).
#
# Предусловия:
#   1. Симулятор «Pray Smoke iPhone 17 Pro» загружен, установлена Release-сборка.
#   2. REM-001 прогнан: разрешение на уведомления выдано, тумблер включён,
#      в правиле одна строка времени 09:00 (дефолт).
#      Если первая строка в другом времени — передайте INIT0=HH:MM.
#
# Сценарий: ставит времена now+4мин и now+9мин (кратно 5), прогоняет флоу.
# Срабатывание уведомлений фиксируется скриншотами устройства: баннер живёт в
# SpringBoard и в accessibility-иерархию приложения (Maestro) не попадает.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
EVIDENCE=/Users/maria/Desktop/Dev/cep/pray/testing/evidence/2026-09-20-reminders
mkdir -p "$EVIDENCE"
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C

# now+DELAY минут, округление ВВЕРХ до кратности 5. Вывод "HH:MM".
ceil_time() {
  local delay=$1
  local total=$((10#$(date +%H) * 60 + 10#$(date +%M) + delay))
  local rounded=$(( (total + 4) / 5 * 5 % 1440 ))
  printf '%02d:%02d' $((rounded / 60)) $((rounded % 60))
}
# Секунды от «сейчас» до "HH:MM + pad".
sleep_until() {
  local t=$1 pad=$2
  local now_s=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
  local target_s=$((10#${t:0:2} * 3600 + 10#${t:3:2} * 60 + pad))
  if (( target_s <= now_s )); then target_s=$((target_s + 86400)); fi
  sleep $((target_s - now_s))
}
shot() { xcrun simctl io "$UDID" screenshot "$EVIDENCE/$1.png" > /dev/null 2>&1; echo "  📸 $1"; }

T1=$(ceil_time 4)
T2=$(ceil_time 9)
echo "== REM-004/011/013: цель $T1"
node testing/e2e/gen-rem-set-time.mjs --init "${INIT0:-09:00}" "$T1" > /tmp/rem-set-time.yaml
maestro test testing/e2e/ios-rem-fire.yaml
sleep_until "$T1" 4
shot REM-004-011-013-banner

INIT1=$T1
T1=$(ceil_time 4)
T2=$(ceil_time 9)
echo "== REM-005: цели $T1, $T2 (исходная строка $INIT1)"
node testing/e2e/gen-rem-set-time.mjs --init "$INIT1" "$T1" "$T2" > /tmp/rem-set-time.yaml
maestro test -e REM_T1="$T1" -e REM_T2="$T2" testing/e2e/ios-rem-005-two-times.yaml
sleep_until "$T1" 4
shot REM-005-first
sleep_until "$T2" 4
shot REM-005-second

echo "== REM-006: перезапуск"
maestro test testing/e2e/ios-rem-006-restart.yaml

# REM-008: первая строка теперь на $T1. Сдвигаем вперёд, выключаем тумблер.
PREV=$T1
T1=$(ceil_time 4)
echo "== REM-008: цель $T1, выключение тумблера"
node testing/e2e/gen-rem-set-time.mjs --init "$PREV" "$T1" > /tmp/rem-set-time.yaml
# Флоу длится ~40 с; sleep внутри флоу (до цели + 90 с) считаем от запуска.
NOW_S=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
TGT_S=$((10#${T1:0:2} * 3600 + 10#${T1:3:2} * 60 + 90))
WAIT_MS=$(( (TGT_S - NOW_S) * 1000 ))
[ "$WAIT_MS" -lt 0 ] && WAIT_MS=1000
printf 'appId: twinkler\n---\n- evalScript: "java.lang.Thread.sleep(%s)"\n' "$WAIT_MS" > /tmp/rem-wait.yaml
maestro test testing/e2e/ios-rem-008-toggle-off.yaml
shot REM-008-no-banner

echo "== Готово. Доказательства: $EVIDENCE"
