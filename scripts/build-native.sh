#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export EXPO_PUBLIC_BUILD_CHANNEL=test

PLATFORM="${1:-}"
case "$PLATFORM" in
  ios|android) shift ;;
  *) echo "Usage: $0 ios|android [expo run options]" >&2; exit 2 ;;
esac

node scripts/bump-version.mjs
# Обновляем нативную версию и при уже существующей папке платформы.
npx expo prebuild --platform "$PLATFORM"
exec npx expo "run:$PLATFORM" "$@"
