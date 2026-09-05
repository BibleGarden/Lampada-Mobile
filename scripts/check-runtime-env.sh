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
    echo "✗ File not found: $file" >&2
    return 1
  fi

  for name in "${REQUIRED[@]}"; do
    if ! grep -Eq "^${name}=.+" "$file"; then
      echo "✗ Missing variable: $name" >&2
      missing=1
    fi
  done

  return "$missing"
}

case "$MODE" in
  local)
    check_names_in_file .env.local
    echo "✔ Local runtime variables are configured"
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
        echo "✗ Missing variable in EAS environment '$EAS_ENVIRONMENT': $name" >&2
        missing=1
      fi
    done
    if [ "$missing" -ne 0 ]; then
      echo "Configure the variables with 'eas env:set' first. Do not commit their values to git." >&2
      exit 1
    fi
    echo "✔ EAS environment '$EAS_ENVIRONMENT' contains the required runtime variables"
    ;;
  *)
    echo "Usage: $0 local | eas <environment>" >&2
    exit 2
    ;;
esac
