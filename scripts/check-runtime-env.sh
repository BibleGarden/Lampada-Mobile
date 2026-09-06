#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"

check_names_in_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "✗ File not found: $file" >&2
    return 1
  fi

  node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    scripts/validate-runtime-env.mjs "$file"
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
    if ! check_names_in_file "$OUTPUT"; then
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
