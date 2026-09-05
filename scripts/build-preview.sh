#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶︎ Checking the EAS preview environment…"
bash scripts/check-runtime-env.sh eas preview

echo "▶︎ Starting an internal EAS preview build…"
exec npx eas-cli@latest build --platform ios --profile preview "$@"
