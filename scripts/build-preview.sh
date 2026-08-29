#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶︎ Проверяю EAS environment preview…"
bash scripts/check-runtime-env.sh eas preview

echo "▶︎ Запускаю внутреннюю EAS preview-сборку…"
exec npx eas-cli@latest build --platform ios --profile preview "$@"
