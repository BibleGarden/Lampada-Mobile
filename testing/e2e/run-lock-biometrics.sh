#!/bin/bash
# Прогон LOCK-009/010 (биометрия) на iOS Simulator.
#
# Face ID симулятора управляется сигналами BiometricKit (notifyutil):
#   enroll/unenroll — com.apple.BiometricKit_Sim.pearl.enrollment (переключатель)
#   совпадение      — com.apple.BiometricKit_Sim.pearl.match
#   несовпадение    — com.apple.BiometricKit_Sim.pearl.nomatch
# Maestro не умеет слать эти сигналы из флоу, поэтому включение/отказ Face ID
# оркестрируются отсюда: флоу засыпает на evalScript-сleep, скрипт в это время
# постит сигнал.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUPTIMEOUT=180000
EVIDENCE=/Users/maria/Desktop/Dev/cep/pray/testing/evidence/2026-09-20-lock
mkdir -p "$EVIDENCE"
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C

signal() { xcrun simctl spawn "$UDID" notifyutil -p "$1"; }

# Начальное состояние: защита выключена. Даём enrollment, если ещё не дан.
signal com.apple.BiometricKit_Sim.pearl.enrollment

echo "== LOCK-009a: включение биометрии"
maestro test testing/e2e/ios-lock-009a-enable-biometrics.yaml > /tmp/lock-009a.log 2>&1 &
M=$!
sleep 30
signal com.apple.BiometricKit_Sim.pearl.match
wait $M || { echo "LOCK-009a FAILED, см. /tmp/lock-009a.log"; exit 1; }

echo "== LOCK-009b: холодный старт, вход по Face ID"
maestro test testing/e2e/ios-lock-009b-cold-start-faceid.yaml > /tmp/lock-009b.log 2>&1 &
M=$!
sleep 30
signal com.apple.BiometricKit_Sim.pearl.match
wait $M || { echo "LOCK-009b FAILED, см. /tmp/lock-009b.log"; exit 1; }

echo "== LOCK-009c: отказ, запасной вход пином"
maestro test testing/e2e/ios-lock-009c-refusal.yaml > /tmp/lock-009c.log 2>&1 &
M=$!
sleep 30
signal com.apple.BiometricKit_Sim.pearl.nomatch
wait $M || { echo "LOCK-009c FAILED, см. /tmp/lock-009c.log"; exit 1; }

echo "== LOCK-010: образцы удалены, вход пином"
signal com.apple.BiometricKit_Sim.pearl.enrollment  # unenroll
maestro test testing/e2e/ios-lock-010-biometrics-removed.yaml > /tmp/lock-010.log 2>&1
echo "LOCK-010 exit=$?"

# Возвращаем enrollment в исходное неважное состояние не нужно: тумблер
# биометрии выключен вместе с пином в конце 010.
echo "== Готово. Доказательства: $EVIDENCE"
