#!/usr/bin/env bash
# Phase timing of the preview-screenshots workflow. Source this file.
#
# phase_run <name> <command>...
#   Runs the command and appends "<name> <TAB> <seconds> <TAB> <exit code>" to
#   $PHASE_FILE (default: $RUNNER_TEMP/phases.tsv), so that phase-summary.sh can
#   show where a job spent its time. Returns the exit code of the command.
PHASE_FILE="${PHASE_FILE:-${RUNNER_TEMP:-/tmp}/phases.tsv}"
phase_run() {
  local name="$1" started rc=0
  shift
  started="$(date +%s)"
  "$@" || rc=$?
  printf '%s\t%s\t%s\n' "$name" "$(($(date +%s) - started))" "$rc" >>"$PHASE_FILE"
  echo "phase $name: $(($(date +%s) - started)) s (exit $rc)" >&2
  return "$rc"
}
