#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export EXPO_PUBLIC_BUILD_CHANNEL=test

PLATFORM="${1:-}"
case "$PLATFORM" in
  ios|android) shift ;;
  *) echo "Usage: $0 ios|android [expo run options]" >&2; exit 2 ;;
esac

if [[ "$PLATFORM" == android ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  [[ -d "$ANDROID_HOME" ]] || { echo "Android SDK not found at $ANDROID_HOME." >&2; exit 2; }
fi

DEVICE="$(bash scripts/resolve-native-device.sh "$PLATFORM" "$@")"
EXPO_DEVICE="$DEVICE"
if [[ "$PLATFORM" == android && "$DEVICE" == emulator-* ]]; then
  # Expo CLI ищет AVD по имени; adb serial нужен для проверки и Maestro.
  EXPO_DEVICE="$("${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb" -s "$DEVICE" emu avd name | head -1 | tr -d '\r')"
  [[ -n "$EXPO_DEVICE" ]] || { echo "Could not resolve AVD name for $DEVICE." >&2; exit 2; }
fi
RUN_ARGS=()
while (($#)); do
  case "$1" in
    --device|-d) shift 2 ;;
    --device=*|-d=*) shift ;;
    *) RUN_ARGS+=("$1"); shift ;;
  esac
done

node scripts/bump-version.mjs test
# Обновляем нативную версию и при уже существующей папке платформы.
npx expo prebuild --platform "$PLATFORM"
exec npx expo "run:$PLATFORM" --device "$EXPO_DEVICE" "${RUN_ARGS[@]}"
