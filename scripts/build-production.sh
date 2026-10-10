#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Один релиз — одна магазинная версия на обе платформы (ADR-0034, ADR-0040).
# По умолчанию сборка резервирует следующую минорную версию. --keep-version
# собирает одну платформу уже зарезервированного релиза без нового номера:
# вторую платформу или повтор после сбоя сборки.
usage() {
  echo "Usage: $0 android|ios|all [eas build options]" >&2
  echo "       $0 android|ios --keep-version [eas build options]" >&2
  exit 2
}

PLATFORM="${1:-}"
case "$PLATFORM" in
  android | ios | all) shift ;;
  *) usage ;;
esac

VERSION_MODE=release
if [ "${1:-}" = "--keep-version" ]; then
  # Зарезервированная версия уже собрана хотя бы для одной платформы:
  # пересборка обеих повторила бы ту, что ушла в магазин.
  [ "$PLATFORM" = all ] && usage
  VERSION_MODE=keep
  shift
fi

export EXPO_PUBLIC_BUILD_CHANNEL=store

bash scripts/check-runtime-env.sh eas production
node scripts/bump-version.mjs "$VERSION_MODE"
exec npx eas-cli@latest build --platform "$PLATFORM" --profile production "$@"
