# Recordings sheet icons

Verified on 2026-09-11 with the local development app on an iPad (A16)
simulator running iOS 26.5.

- A downward chevron replaces the recordings sheet's close cross.
- The transcript removal button, callback and unused translations are removed.
- Transcripts keep their expand/collapse and append-to-answer actions.
- The chevron uses the shared icon scale once, avoiding an oversized tablet icon.
- `npm run typecheck` passed (exit 0).
- `git diff --check` passed (exit 0).

Visual checks used the actual `RecordingsSheet` component with a temporary,
local fixture containing synthetic recording metadata and transcript text.
The chevron closed the sheet. The transcript has no separate deletion action;
the recording's trash button remains. No audio was recorded or uploaded;
persistence and audio playback were not exercised.
The temporary preview route was removed after verification.

[iPad screenshot](../evidence/2026-09-11-recordings-icons/ipad-portrait.png)
