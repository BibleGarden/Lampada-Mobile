# Scripture narration unavailable — 2026-10-12

Revision: the commit containing this report on `fix/answer-question-label`, PR #45. No native build was made. The local app version change in `app.json` is excluded from the commit.

## Verified by unit tests

- `scriptureAudioClient.test.mjs`: Isaiah 40:28-31 with all-zero timings returns `audio_unavailable`, including when the books catalog does not list the chapter as missing. Partial alignment is also unavailable; a fully timed passage remains playable, including a valid first verse beginning at zero.
- `useScriptureAudio.test.mjs`: unavailable narration exits loading, does not acquire an audio session or play, records a cause code and translation/voice/book/chapter identifiers, and prevents another Listen attempt for the same state. The expired prayer completes after one second. A malformed response remains a reported playback error.
- Both `npm run typecheck` and `npm test` exited 0 on the final source revision. Stored exit-code summaries (full logs are excluded from git): [`../evidence/2026-10-12-scripture-audio-unavailable/`](../evidence/2026-10-12-scripture-audio-unavailable/).

## Validation limits

The card disables Listen and shows the narration-unavailable label; the reader keeps Listen disabled with the unavailable accessible label. Visual approval and Maestro validation were not performed because the owner explicitly requested no builds or emulators. SCR-033 in `TEST_PLAN.md` describes the remaining device check. No alignment audit report is retained, as requested by the owner.
