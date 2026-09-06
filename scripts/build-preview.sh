#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export EXPO_PUBLIC_BUILD_CHANNEL=test

echo "▶︎ Checking the EAS preview environment…"
bash scripts/check-runtime-env.sh eas preview

node scripts/bump-version.mjs

echo "▶︎ Starting an internal EAS preview build…"
exec npx eas-cli@latest build --platform ios --profile preview "$@"
