# Journal transcription (JRN-010…013) — run 2026-09-20

Device: iPhone 17 Pro simulator (iOS 26.5), Release build pointed at the API
stub (`EXPO_PUBLIC_API_URL=http://localhost:9085`), Metro serving the bundle
with the same overrides. The stub's `/api/ai/transcribe` returns a fixed text
(«Стабильная расшифровка лампады номер семь») or failure/delay under the
control of `POST localhost:9085/__control` between flow runs.

These scenarios cover the September 2026 transcription feature; they had no
run or report before this one.

## Results

| ID | Result | Evidence |
|---|---|---|
| JRN-010 | Passed | `ios-jrn-010-011-transcribe.yaml`: «Расшифровать» → consent sheet on first use → text appears under the audio player; after closing and reopening the details the transcript is still there (saved in SQLite) |
| JRN-011 | Passed | same flow: searching «стабильная» (lowercase) finds the prayer by the transcript — search is case-insensitive over transcripts (`JRN-011-search-transcript.png`) |
| JRN-012 | Passed | `ios-jrn-012a/012b`: stub in fail mode → «Не удалось расшифровать» + «Повторить», the audio row stays; after switching the stub to ok, a fresh transcribe (the error state is in-memory by design and does not survive a relaunch) saves the text, and it persists across detail reopening (`JRN-012-error.png`, `JRN-012-retry-saved.png`) |
| JRN-013 | Passed | `ios-jrn-013a/013b`: with the stub answering after 12 s, closing the details cancels the request — a late response brings neither text nor a stuck loader back; deleting the prayer during transcription cancels it as well — the entry stays deleted and the DB holds no orphaned recording rows (checked with sqlite3: 0 orphans) |

## Artefacts

- Flows: `testing/e2e/ios-jrn-010-011-transcribe.yaml`, `ios-jrn-012a-*`,
  `ios-jrn-012b-*`, `ios-jrn-013a-*`, `ios-jrn-013b-*`
- Evidence: `testing/evidence/2026-09-20-jrn/`
- Driver: `testing/e2e/run-stub-phase.sh` (the JRN part was re-driven manually
  after fixing two flow findings; logs `/tmp/stub-phase-run1.log` and the
  continuation run output)

## Notes for future runs

- The stub answers in milliseconds, so the «Расшифровываю…» loading label is
  not assertable in the success path; it is asserted in the 12-s delay mode
  (JRN-013).
- JRN-012's error state is intentionally not persisted: after an app relaunch
  the recording offers «Расшифровать» again.

## Defects

None found.
