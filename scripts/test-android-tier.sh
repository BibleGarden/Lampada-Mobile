#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  main)
    flows=(
      android-rpt-006-keyboard
      android-ans-024-recordings-keyboard
      android-ans-023-recordings-actions
      android-ans-032-recordings-keyboard
      android-answer-recordings-persistence
      android-answer-recordings-regression
      android-end-006-takeaway-keyboard
      android-keyboard-reflect-journal
      android-lock-001-disabled-by-default
      android-music-finish-early
      android-music-finish-untimed
      android-music-timer-finish
      android-music-toggle
      android-privacy-audio-consent
      android-scr-025-reader-safe-area
      android-scripture-default-language
      android-scripture-settings
      android-scripture-user-choice-overrides-locale
      android-stage03-deep-links
      android-stage03-long-goal
      android-stage03-session-infinite
      android-stage04-unsaved-answer-swipe
      android-stage05-ai-opt-in-payload
      android-stage05-ai-success-payload
      android-stage05-ai-timeout
      android-stage05-first-question-error-fallback
      android-stage05-first-question-no-topic
      android-stage05-first-question-spinner
      android-stage05-privacy-setting
      android-stage06-end-003-004-idempotency
      android-stage06-jrn-002-abandoned-session
      android-stage06-jrn-005-prayer-a
      android-stage06-scr-003-small-reader
    )
    ;;
  rare)
    flows=(
      android-scripture-audio-resume-cancel
      android-scripture-translation-labels
      android-stage06-scr-003-long-reader
      android-stage07-jrn-share-001
    )
    ;;
  *) echo 'Usage: test-android-tier.sh main|rare' >&2; exit 2 ;;
esac

exec bash scripts/test-android.sh "${flows[@]}"
