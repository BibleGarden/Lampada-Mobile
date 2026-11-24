#!/usr/bin/env bash
# Prints the phases recorded by phases.sh as a Markdown table, for the job
# summary: phase-summary.sh <title> >> "$GITHUB_STEP_SUMMARY"
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/phases.sh"
title="${1:?title}"
[[ -s "$PHASE_FILE" ]] || exit 0
echo "#### Phases: $title"
echo
echo '| Phase | Seconds | Exit |'
echo '| --- | ---: | ---: |'
total=0
while IFS=$'\t' read -r name secs rc; do
  echo "| $name | $secs | $rc |"
  total=$((total + secs))
done <"$PHASE_FILE"
echo "| **sum of phases** | **$total** | |"
echo
