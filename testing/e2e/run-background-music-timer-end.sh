#!/bin/bash
# ADR-0033: music stops when the prayer timer expires in the background.
#
# Maestro cannot hear audio, so the player stop is verified via the
# simulator's unified log: the Lampada process must stop FigPlayer after
# starting it, all before returning to the app. Returning to the same process
# then opens the prayer summary.
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
  echo "FAIL: music never started" >&2
  exit 1
fi
STARTS="$(grep -c 'client starting' <<< "$PLAYER_EVENTS")"
STOPS="$(grep -c 'client stopping' <<< "$PLAYER_EVENTS" || true)"
if [ "$STARTS" != "$STOPS" ]; then
  echo "FAIL: players still playing after the background timer expired: $((STARTS - STOPS))" >&2
  exit 1
fi
echo "OK: music stopped in the background"

maestro --device "$UDID" test --test-output-dir "$OUT" testing/e2e/ios-background-timer-resume.yaml
