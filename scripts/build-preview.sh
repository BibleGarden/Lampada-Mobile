#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export EXPO_PUBLIC_BUILD_CHANNEL=test

echo "▶︎ Checking the EAS preview environment…"
bash scripts/check-runtime-env.sh eas preview

node scripts/bump-version.mjs test

echo "▶︎ Starting an internal EAS preview build…"
exec bash scripts/eas-cli.sh build --platform ios --profile preview "$@"
