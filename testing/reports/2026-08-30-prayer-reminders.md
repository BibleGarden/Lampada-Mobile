# Prayer reminders, stage 1 - verification report

- Date: 2026-08-30
- Task: ClickUp `86cbbpt5w`, stage 1 of task `86cbbm5c0`
- Manual verification environment: a physical iPhone, the local Release build
  from `npm run iphone`. REM-002 and REM-003 were verified on an iPad simulator,
  iOS 26.5, a debug build
- Expo: SDK 57, `expo-notifications` 57.0.15
- Commits: `ad1183e` (the reminders), `999cac3` (an accompanying fix to the timer
  types)

## What was implemented

- The schedule is a set of "weekdays x times" rules, stored in `meta` atomically
  as a single JSON value `prayer_reminders`.
- The scheduling is system-side: every "day x time" pair expands into an
  `expo-notifications` WEEKLY trigger, and the OS holds the repetition.
- A full rescheduling on every change of the schedule and on every app launch; a
  pool of twelve short phrases is reshuffled on every scheduling.
- The permission is requested at the moment the reminders are turned on, not at
  app start.
- A separate Android channel `prayer_reminders` and the `content.data.kind`
  mark: cancelling does not affect the ongoing chronometer of the prayer timer
  (ADR-0010).
- Tapping a notification opens Home, except on the screens of an ongoing prayer
  scenario.

The decision and the rejected options are in
[ADR-0013](../../architect/decisions/0013-local-prayer-reminders.md).

## Automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS, exit 0 | `testing/evidence/2026-08-30-reminders/typecheck.log` |
| `npm test` | PASS, 86/86, exit 0 | `testing/evidence/2026-08-30-reminders/tests.log` |

Sixteen new unit tests cover the validation of the schedule, the expansion of the
rules into triggers, the conversion of the weekdays into the expo-notifications
numbering, the rendering of the schedule into a human-readable line and the
reshuffling of the phrase pool.

The automated tests cover only the pure logic: the delivery of the notifications,
the behaviour after a device reboot and the routing on a tap are verified
manually.

## Manual verification on an iPhone

| ID | Scenario | Result |
| --- | --- | --- |
| REM-001 | The permission is requested at the moment the reminders are turned on | PASS |
| REM-002 | A refusal: the screen does not break, an explanation is shown | PASS |
| REM-003 | The permission is granted in the system settings, then a return to the app | PASS, the schedule is laid out again without a restart |
| REM-004 | The notification arrives at the set time | PASS |
| REM-005 | Several times on the same day | PASS |
| REM-006 | The schedule survives an app restart | PASS |
| REM-007 | The schedule survives a device reboot | PASS |
| REM-008 | Turning the toggle off cancels the scheduled notifications | PASS |
| REM-009 | Tapping a notification opens Home | PASS |
| REM-010 | A tap during an ongoing prayer does not throw the user out of the session | PASS |
| REM-011 | The display while the app is open | PASS indirectly: confirmed through REM-010 |
| REM-012 | A reminder does not replace the ongoing chronometer of the timer | PASS |
| REM-013 | A reminder arrives on a day when the person already prayed | PASS |

The twelve rotation phrases were reviewed and accepted by the product owner.

## Defects found

| Task | Defect | Status |
| --- | --- | --- |
| `86cbbpxn9` | The phrase went into the notification title; iOS shows the title on a single line and truncates it | Fixed and retested: the phrase moved into the body, the title is the app name from the configuration |

## Not verified

- **Android as a whole** - moved to a separate task `86cbbph5j` together with a
  known risk: the `icon` is not set in the config plugin, so the tray icon may
  look like a white square.
