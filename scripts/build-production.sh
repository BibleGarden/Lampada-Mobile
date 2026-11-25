#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# One release ships one store version on both platforms (ADR-0034, ADR-0040).
# By default a build reserves the next minor version. --keep-version builds
# one platform of an already reserved release without a new number: the other
# platform, or a retry after a failed build.
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
  # The reserved version is already built for at least one platform:
  # rebuilding both would repeat the one already shipped to the store.
  [ "$PLATFORM" = all ] && usage
  VERSION_MODE=keep
  shift
fi

export EXPO_PUBLIC_BUILD_CHANNEL=store

bash scripts/check-runtime-env.sh eas production
node scripts/bump-version.mjs "$VERSION_MODE"

if [ "$PLATFORM" = all ]; then
  # Android goes to internal testing; iOS is only built.
  bash scripts/eas-cli.sh build --platform android --profile production --auto-submit "$@"
  exec bash scripts/eas-cli.sh build --platform ios --profile production "$@"
elif [ "$PLATFORM" = android ]; then
  exec bash scripts/eas-cli.sh build --platform android --profile production --auto-submit "$@"
else
  exec bash scripts/eas-cli.sh build --platform ios --profile production "$@"
fi
