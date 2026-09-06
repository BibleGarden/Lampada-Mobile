#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export EXPO_PUBLIC_BUILD_CHANNEL=store

bash scripts/check-runtime-env.sh eas production
node scripts/bump-version.mjs
exec npx eas-cli@latest build --platform ios --profile production "$@"
