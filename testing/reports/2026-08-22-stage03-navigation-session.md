# Stage 03 - navigation, setup and the Lampada timer

- Date: 2026-08-22
- Status: **Passed with limitations**
- Source commit: `a38a07a8610dae641d98e014b3b39d8b8f2e31ea`
- Changes under test: uncommitted fixes to the stateful deep links and to the
  handling of a session creation error

## Outcome

20 scenarios were checked: NAV-001 to NAV-005, SETUP-001 to SETUP-004, START-001
to START-004 and SES-001 to SES-007. The result: 18 Passed, 1 Blocked, 1 Not run,
0 Failed after the fixes.

Two defects that were found have been fixed and re-verified on a native iOS
Release build:

- stateful deep links without an active session can no longer make a prayer day
  count;
- an error while creating a session shows an Alert, leaves the button available
  and writes safe local diagnostics outside SQLite.

## Environment

- `Pray Smoke iPhone 17 Pro`, iOS 26.5
- UDID `05F697B7-36CD-4050-9D57-FC9316AA093C`
- Release, `iphonesimulator`
- bundle `com.marianovikov.lampada`
- Expo SDK 57.0.15, React Native 0.86.2

The final Release build exited with code 0 and the `BUILD SUCCEEDED` marker. The
final full log has 8,196 lines, 0 error lines and 58 warning lines; no warnings
from `ios/Lampada` were found.

## Results

| ID | Status | Actual result |
|---|---|---|
| NAV-001 | Passed | A clean launch shows the home screen and an available main flow |
| NAV-002 | Passed | An unfinished goal and 30 minutes reset to an empty goal and 10 minutes |
| NAV-003 | Passed | `/session`, `/reflect` and `/done` without a `sessionId` return Home; SQLite stays at `sessions=0`, `prayed_days=0` |
| NAV-004 | Not run | Android Back does not apply to the available iOS build; moved to the Android run |
| NAV-005 | Passed | Double presses on the entry and on "Next" create no duplicate screens or sessions |
| SETUP-001 | Passed | An empty goal starts a free prayer without a broken phrase |
| SETUP-002 | Passed | All four examples can be picked, the modal closes |
| SETUP-003 | Passed | The `5/15/30/60/∞` presets, the declensions and the lower safe bound work |
| SETUP-004 | Passed | After the system "Done" key the keyboard closes and "Next" is available; a long goal makes it into the session |
| START-001 | Passed | A short hold resets and creates no session |
| START-002 | Passed | A full hold opens the timer and creates one session |
| START-003 | Passed | The transition guard and the SQL checks found no parallel sessions |
| START-004 | Passed | Under `BEGIN EXCLUSIVE` an Alert is shown and there are 0 sessions; after a `ROLLBACK` a retry creates exactly one session |
| SES-001 | Passed | The finite timer reached zero and opened one reflection |
| SES-002 | Passed | In `∞` the elapsed time grows, there is no automatic finish |
| SES-003 | Passed | The `−1/+1` correction works, the lower bound stays at 5 seconds |
| SES-004 | Blocked | Not checked on a physical iPhone; the product policy for background/foreground is undefined |
| SES-005 | Passed | Finishing early and saving an open answer are confirmed by the smoke run and by SQLite |
| SES-006 | Passed | "Back to prayer" starts a new countdown with the same goal; the previous record and answer stay in SQLite |
| SES-007 | Passed | A long goal is limited to three lines and does not overlap the timer or the companion panel |

## Defect retests

### Deep links without a session

From a clean state `lampada://session`, `lampada://reflect` and `lampada://done`
were opened in turn. Every route showed Home. The resulting SQL:

```text
sessions|0
prayed_days|0
```

A normal `setup → threshold → session` after that successfully creates one
session.

### The SQLite error

With an external `BEGIN EXCLUSIVE`, a full hold shows: "Не удалось начать
молитву" / "Попробуй ещё раз". After the Alert is dismissed the button is
available again, `sessions_under_lock=0`.

The file `Documents/lampada-diagnostics.log` contains one JSONL record with the
time, the event `session_start_failed` and `errorKind=error`. The goal, the
answers, the error text, the stack and any database details are absent. After a
`ROLLBACK` a repeated hold succeeds, `sessions_after_retry=1`.

## Evidence

Directory: `testing/evidence/2026-08-22-stage03/`.

- `maestro-navigation.log`, `maestro-setup-start.log`;
- `maestro-session-finite.log`, `maestro-session-infinite.log`;
- `maestro-long-goal.log`, `SES-007-long-goal.png`;
- `maestro-deep-links.log`;
- `maestro-sqlite-*.log`, `START-004-alert.png`;
- `sql-and-diagnostics.txt`, `typecheck.log`, `build-summary.txt`,
  `exit-codes.txt`.

## Limitations

NAV-004 requires an Android build. SES-004 requires a product decision on whether
the timer should pause or account for real time, and a final manual run on a
physical iPhone. Haptics cannot be confirmed on the Simulator.
