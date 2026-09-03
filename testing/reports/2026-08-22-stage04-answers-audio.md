# Stage 04 - answers and audio

Date: 2026-08-22
Environment: iOS Simulator 26.5, `Pray Smoke iPhone 17 Pro`, the installed custom
build `com.marianovikov.lampada`.

## Checks performed

| Scenario | Method | Result |
| --- | --- | --- |
| ANS-001 | Maestro `ios-stage04-answers-text.yaml` | Passed: the saved text is restored when the same question is reopened. |
| ANS-002 | Analysis of the UI logic | Needs a manual check: an empty sheet closes without a confirmation. |
| ANS-003 | Analysis of the UI logic | Failed: closing by a swipe bypasses the confirmation and loses the unsaved text. A defect was filed. |
| ANS-004 to ANS-009 | A physical iPhone | Not performed: the Simulator does not confirm the system permission, recording, playback and the cleanup of sandbox files. |
| ANS-010 to ANS-011 | Analysis of the UI logic | A separate manual retest is needed for the race at zero on the timer and for switching between questions. |

## Defects found and re-verified

- Fix the loss of an unsaved answer when closing by a swipe: the fix disables
  closing by a swipe and by the background while the draft is non-empty. The
  static retest passed; a manual check on an iPhone is pending.
- Delete the file of a recording that was removed before the answer was saved:
  the retest on a physical iPhone passed. After "record → delete → save" no new
  entry appeared in `Documents/ExpoAudio` or in SQLite; the bug is closed.

## Automated checks

The full logs are stored outside the repository:

- `npm run typecheck` - exit code `0`;
- `npm test` - exit code `0`, 5/5 tests passed;
- the Maestro flow `testing/e2e/ios-stage04-answers-text.yaml` - every step
  completed successfully on the Simulator.
- After the fixes the checks were repeated: `npm run typecheck` - exit code `0`;
  `npm test` - 5/5, exit code `0`; `git diff --check` - no complaints.

The final confirmation that the text is restored:
`testing/evidence/2026-08-22-stage04/ANS-001-restored-text.png`.

The stage was moved to "manual testing": both fixes need a retest and ANS-004 to
ANS-011 need a run on a physical iPhone.
