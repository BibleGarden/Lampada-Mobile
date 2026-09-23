#!/bin/bash
# ADR-0033: музыка останавливается, когда таймер молитвы истекает в фоне.
#
# Maestro не видит звук, поэтому остановку плеера проверяет unified log
# симулятора: у процесса Lampada после старта FigPlayer должна быть его
# остановка, и всё это до возврата в приложение. Затем возврат в тот же процесс
# открывает итог молитвы.
set -euo pipefail
cd "$(dirname "$0")/../.."

export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
OUT="${TMPDIR:-/tmp/}pray-e2e-output"
UDID="${UDID:-$(testing/e2e/sim-udid.sh "Pray Smoke iPhone 17 Pro")}"

STARTED="$(date '+%Y-%m-%d %H:%M:%S')"
maestro --device "$UDID" test --test-output-dir "$OUT" testing/e2e/ios-background-music-timer-end.yaml

PLAYER_EVENTS="$(xcrun simctl spawn "$UDID" log show --start "$STARTED" --style compact \
  --predicate 'process == "Lampada" AND category == "aqme" AND eventMessage CONTAINS "FigPlayer"' \
  | grep -oE 'client (starting|stopping)')"
echo "$PLAYER_EVENTS"
if ! grep -q 'client starting' <<< "$PLAYER_EVENTS"; then
  echo "FAIL: музыка не запускалась" >&2
  exit 1
fi
STARTS="$(grep -c 'client starting' <<< "$PLAYER_EVENTS")"
STOPS="$(grep -c 'client stopping' <<< "$PLAYER_EVENTS" || true)"
if [ "$STARTS" != "$STOPS" ]; then
  echo "FAIL: после истечения таймера в фоне играет плееров: $((STARTS - STOPS))" >&2
  exit 1
fi
echo "OK: музыка остановлена в фоне"

maestro --device "$UDID" test --test-output-dir "$OUT" testing/e2e/ios-background-timer-resume.yaml
