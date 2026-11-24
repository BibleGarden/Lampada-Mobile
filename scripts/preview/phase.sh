#!/usr/bin/env bash
# Runs a command as a timed phase, for workflow steps: phase.sh <name> <command>...
set -euo pipefail
# shellcheck source=phases.sh
source "$(dirname "${BASH_SOURCE[0]}")/phases.sh"
phase_run "$@"
