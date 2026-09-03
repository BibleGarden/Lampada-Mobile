# Stage 06 - scripture, finishing and the journal

Date: 22-23 August 2026
Task: ClickUp `86cb8kdyu`
Repository: `pray`
Environment: iPhone 17 Pro Simulator / iOS 26.5; iPhone SE (3rd generation)
Simulator / iOS 26.5; an Expo SDK 57 dev build.

## Outcome

After three defects were fixed, all 17 scenarios of the stage passed: SCR-001 to
SCR-003, END-001 to END-005 and JRN-001 to JRN-009.

The bugs found and closed after the retest:

- `86cb8pj4y` - future prayer dates pushed the real dots of the week out;
- `86cb8pmtr` - scripture favourites were not restored after a relaunch;
- `86cb8pq1k` - absolute audio URIs broke after an install-over and a change of
  the iOS data container UUID;
- `86cb8pu8c` - while recording with the keyboard open, the stop button ended up
  outside the reachable area.

## Scenario matrix

| ID | Result | Method |
|---|---|---|
| SCR-001 | PASS | Maestro: entering scripture, replacing the frontier without a favourite, growing the trail with a favourite, both boundaries |
| SCR-002 | PASS | Maestro: add → relaunch → restore → remove → relaunch |
| SCR-003 | PASS | Maestro plus a visual check of scrolling a long passage on an iPhone 17 Pro and an iPhone SE |
| END-001 | PASS | Maestro plus SQLite: finishing without a takeaway, no empty card, the record is visible in the journal |
| END-002 | PASS | Maestro: the takeaway is visible on Done and in the journal |
| END-003 | PASS | Maestro plus SQLite: a double finish created one session and one day mark |
| END-004 | PASS | Maestro plus SQLite: two meaningful sessions, one `prayed_days` row |
| END-005 | PASS after the fix | A regression unit test in Europe/Moscow, America/New_York and Australia/Lord_Howe; future dates, DST and the day boundary |
| JRN-001 | PASS | Maestro: an empty history and an empty search |
| JRN-002 | PASS | Maestro plus SQLite: an abandoned empty session is not shown |
| JRN-003 | PASS | Maestro with prepared SQLite data: search by the goal, the takeaway, a question and an answer |
| JRN-004 | PASS | Maestro: a Cyrillic search in a different case |
| JRN-005 | PASS after the fix | Maestro: a real recording, the text, saving, finishing and the journal details |
| JRN-006 | PASS | Maestro plus a visual check: when switching details the pause indicator stays only on the active source |
| JRN-007 | PASS | Maestro plus SQLite plus the file: the cascade was deleted, `prayed_days` survived |
| JRN-008 | PASS after the fix | `simctl install` over the build, SHA-256 of SQLite and the audio, the migration of legacy URIs, playback in the journal |
| JRN-009 | PASS | Maestro with a missing file: the details and an attempt to play do not crash |

## Final code checks

- `npm test`: 13/13, exit 0;
- `npm run typecheck`: exit 0;
- `npx expo install --check`: dependencies up to date, exit 0;
- `git diff --check`: exit 0;
- a Debug iOS build for the install-over: exit 0.

## Evidence

The full scenario logs:

- `scr-maestro-001.log`, `scr-maestro-002.log`, `scr-maestro-003-small.log`;
- `end-maestro-001.log`, `end-maestro-002.log`, `end-maestro-003-004.log`;
- `jrn-maestro-001.log`, `jrn-maestro-002.log`, `jrn-maestro-003-004.log`,
  `jrn-maestro-005.log`, `jrn-maestro-006.log`, `jrn-maestro-007.log`,
  `jrn-maestro-008.log`, `jrn-maestro-009.log`;
- `final-tests.log`, `final-typecheck.log`, `final-expo-check.log`,
  `final-diff-check.log`.

The database snapshots and the install-over:

- `end-sqlite-001-after.txt`, `end-sqlite-003-004.txt`,
  `end-datelogic-check.txt`, `end-datelogic-final-pass.txt`;
- `jrn-sqlite-00-initial.txt`, `jrn-sqlite-002-abandoned.txt`,
  `jrn-sqlite-007-after-delete.txt`;
- `jrn-008-install-over-before.txt`, `jrn-008-install-over-after.txt`.

The final screenshots:

- `END-001-home-before.png`, `END-001-reflect-empty-input.png`,
  `END-001-done-no-takeaway-card.png`, `END-001-home-after.png`,
  `END-001-journal.png`;
- `END-002-reflect-filled.png`, `END-002-done-takeaway-card.png`,
  `END-002-journal-takeaway.png`, `END-003-004-two-prayers-one-day.png`;
- `JRN-001-empty-history.png`, `JRN-001-empty-search.png`,
  `JRN-002-session-started.png`, `JRN-002-journal-after-abandon.png`,
  `JRN-003-004-search-cyrillic.png`;
- `JRN-005-recording-overlay-a.png`, `JRN-005-recording-saved-a.png`,
  `JRN-005-journal-detail-text-audio.png`;
- `JRN-006-first-playing.png`, `JRN-006-second-playing.png`,
  `JRN-007-after-delete.png`, `JRN-008-after-install-over-playback.png`,
  `JRN-009-missing-file-handled.png`;
- `SCR-001-00-initial-scripture.png`, `SCR-001-A1-next.png`,
  `SCR-001-A6-prev-after-noop-forward.png`, `SCR-001-B00-favorited.png`,
  `SCR-001-B10-next-catalog-exhausted.png`,
  `SCR-001-B11-next-past-exhausted.png`, `SCR-001-C10-prev-at-start.png`,
  `SCR-001-C11-prev-boundary-noop.png`;
- `SCR-002-before-relaunch.png`, `SCR-002-after-relaunch.png`,
  `SCR-002-removed-after-relaunch.png`;
- `SCR-003-long-reader-top.png`, `SCR-003-long-reader-bottom.png`,
  `SCR-003-small-reader-top.png`, `SCR-003-small-reader-bottom.png`.

`end-datelogic-check.txt` preserves the first reproduction of END-005 with a
FAIL. The final all-PASS run in Europe/Moscow, America/New_York and
Australia/Lord_Howe is preserved in `end-datelogic-final-pass.txt`; the
regression unit test is in `final-tests.log`.
