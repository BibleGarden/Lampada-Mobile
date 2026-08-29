#!/usr/bin/env bash
set -euo pipefail

REQUIRED=(
  EXPO_PUBLIC_AI_PROXY_URL
  EXPO_PUBLIC_AI_PROXY_KEY
  EXPO_PUBLIC_AI_TRANSCRIBE_URL
)

MODE="${1:-}"

check_names_in_file() {
  local file="$1"
  local missing=0

  if [ ! -f "$file" ]; then
    echo "✗ Не найден $file" >&2
    return 1
  fi

  for name in "${REQUIRED[@]}"; do
    if ! grep -Eq "^${name}=.+" "$file"; then
      echo "✗ Отсутствует $name" >&2
      missing=1
    fi
  done

  return "$missing"
}

case "$MODE" in
  local)
    check_names_in_file .env.local
    echo "✔ Локальные runtime-переменные настроены"
    ;;
  eas)
    EAS_ENVIRONMENT="${2:-preview}"
    CHECK_DIR=$(mktemp -d)
    trap 'find "$CHECK_DIR" -depth -delete' EXIT
    OUTPUT="$CHECK_DIR/eas-env.txt"

    npx eas-cli@latest env:list "$EAS_ENVIRONMENT" --format short > "$OUTPUT"
    missing=0
    for name in "${REQUIRED[@]}"; do
      if ! grep -q "^${name}=" "$OUTPUT"; then
        echo "✗ В EAS environment '$EAS_ENVIRONMENT' отсутствует $name" >&2
        missing=1
      fi
    done
    if [ "$missing" -ne 0 ]; then
      echo "Сначала настрой переменные через 'eas env:set'. Значения не добавляй в git." >&2
      exit 1
    fi
    echo "✔ EAS environment '$EAS_ENVIRONMENT' содержит обязательные runtime-переменные"
    ;;
  *)
    echo "Использование: $0 local | eas <environment>" >&2
    exit 2
    ;;
esac
