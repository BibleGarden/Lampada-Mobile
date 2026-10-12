#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

tier="$1"
shift
case "$tier" in
  critical|main|rare) tags=(--include-tags="$tier") ;;
  all) tags=(--exclude-tags=ipad,prepared) ;;
  *) echo "Unknown e2e tier: $tier" >&2; exit 2 ;;
esac

if (($#)); then
  [[ "$1" == --device && $# == 2 ]] || {
    echo 'Usage: run-e2e-tier.sh <tier> [--device <serial or simulator>]' >&2; exit 2;
  }
  device="$2"
else
  # Предпочитаем именованный iOS-симулятор, используемый этими наборами.
  udid="$(testing/e2e/sim-udid.sh 'Pray Smoke iPhone 17 Pro')"
  if xcrun simctl list devices booted -j | python3 -c \
    'import json,sys; udid=sys.argv[1]; sys.exit(not any(d["udid"] == udid and d["state"] == "Booted" for ds in json.load(sys.stdin)["devices"].values() for d in ds))' "$udid"; then
    device="$udid"
  else
    device="$(bash scripts/resolve-native-device.sh ios)"
  fi
fi

[[ "$device" != RFCW90KWKBH ]] || { echo 'Owner phone is prohibited.' >&2; exit 2; }

MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device "$device" test "${tags[@]}" \
  --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" testing/e2e/
