#!/bin/bash
# Прогон REM-флоу срабатывания (REM-004/005/006/008).
#
# Предусловия:
#   1. Симулятор «Pray Smoke iPhone 17 Pro» загружен, установлена Release-сборка.
#   2. REM-001 прогнан: разрешение на уведомления выдано, тумблер включён,
#      в правиле одна строка времени 09:00 (дефолт).
#      Если состояние другое — поправьте переменные INIT ниже.
#
# Сценарий: ставит времена now+4мин и now+9мин (кратно 5), прогоняет флоу,
# следит, чтобы начальные времена строк в gen-rem-set-time.mjs совпадали
# с реальным состоянием редактора после каждого шага.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
EVIDENCE=/Users/maria/Desktop/Dev/cep/pray/testing/evidence/2026-09-20-reminders
mkdir -p "$EVIDENCE"

# now+DELAY минут, округление ВВЕРХ до кратности 5. Вывод "HH:MM".
ceil_time() {
  local delay=$1
  local total=$((10#$(date +%H) * 60 + 10#$(date +%M) + delay))
  local rounded=$(( (total + 4) / 5 * 5 % 1440 ))
  printf '%02d:%02d' $((rounded / 60)) $((rounded % 60))
}
# Миллисекунды от «сейчас» до "HH:MM + запас".
ms_until() {
  local t=$1 pad=$2
  local now_s=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
  local target_s=$((10#${t:0:2} * 3600 + 10#${t:3:2} * 60 + pad))
  if (( target_s <= now_s )); then target_s=$((target_s + 86400)); fi
  echo $(( (target_s - now_s) * 1000 ))
}

T1=$(ceil_time 4)
T2=$(ceil_time 9)
echo "== REM-004/011/013: цель $T1"
node testing/e2e/gen-rem-set-time.mjs "${INIT0:-09:00}" "$T1" > /tmp/rem-set-time.yaml
maestro test testing/e2e/ios-rem-fire.yaml

INIT1=$T1
T1=$(ceil_time 4)
T2=$(ceil_time 9)
echo "== REM-005: цели $T1, $T2 (исходная строка $INIT1)"
node testing/e2e/gen-rem-set-time.mjs --init "$INIT1" "$T1" "$T2" > /tmp/rem-set-time.yaml
maestro test -e REM_T1="$T1" -e REM_T2="$T2" testing/e2e/ios-rem-005-two-times.yaml

echo "== REM-006: перезапуск"
maestro test testing/e2e/ios-rem-006-restart.yaml

# REM-008: первая строка теперь на $T1, вторая на $T2 (в прошлом). Первую сдвигаем вперёд.
PREV=$T1
T1=$(ceil_time 4)
echo "== REM-008: цель $T1, выключение тумблера"
node testing/e2e/gen-rem-set-time.mjs --init "$PREV" "$T1" > /tmp/rem-set-time.yaml
SLEEP_MS=$(ms_until "$T1" 90)
echo "- evalScript: \"java.lang.Thread.sleep($SLEEP_MS)\"" >> /tmp/rem-set-time.yaml
maestro test testing/e2e/ios-rem-008-toggle-off.yaml

echo "== Готово. Доказательства: $EVIDENCE"
