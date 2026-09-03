# Schedule settings and local notifications - verification report

Date: 2026-09-02  
Device: the iOS Simulator `Pray SE`, iOS 26.5  
Build: a local Debug build, Expo SDK 57

## Result

Setting up several schedules, saving them into SQLite, turning them on and off,
rescheduling and the actual delivery of a local notification all work.

The original schedule of the simulator was saved before the check and restored
afterwards. After the restoration the system archive again holds exactly the 12
expected WEEKLY requests.

## Checks

| Check | Result | Evidence |
|---|---|---|
| The full `npm test` | PASS, exit 0, 128/128 | [`npm-test.log`](../evidence/2026-09-02-reminder-settings-notifications/npm-test.log) |
| TypeScript `npm run typecheck` | PASS, exit 0 | [`typecheck.log`](../evidence/2026-09-02-reminder-settings-notifications/typecheck.log) |
| Two saved schedules and the add item are visible in the UI | PASS | [`ui-multiple-schedules.log`](../evidence/2026-09-02-reminder-settings-notifications/ui-multiple-schedules.log) |
| Adding a third schedule, changing a day, saving into SQLite | PASS | [`ui-multiple-schedules.log`](../evidence/2026-09-02-reminder-settings-notifications/ui-multiple-schedules.log) |
| Turning off: `enabled=false`, 0 pending requests | PASS | [`toggle-off.log`](../evidence/2026-09-02-reminder-settings-notifications/toggle-off.log) |
| Turning back on: `enabled=true`, the pending request is restored | PASS | [`toggle-on.log`](../evidence/2026-09-02-reminder-settings-notifications/toggle-on.log) |
| A control rule for Wednesday 12:32 reached iOS as WEEKLY (`weekday=4`) | PASS | [`controlled-pending.txt`](../evidence/2026-09-02-reminder-settings-notifications/controlled-pending.txt) |
| The notification was delivered with the app terminated | PASS | [`delivered-after.txt`](../evidence/2026-09-02-reminder-settings-notifications/delivered-after.txt), [`notification-center.png`](../evidence/2026-09-02-reminder-settings-notifications/notification-center.png) |
| The original schedule was restored, pending=12 | PASS | [`pending-after-restore.txt`](../evidence/2026-09-02-reminder-settings-notifications/pending-after-restore.txt) |

## Not confirmed

Opening the app by tapping an already delivered notification was not confirmed
automatically. Maestro tapped the card on the Notification Centre screen twice,
but the iOS Simulator left the screen locked and the app did not open. This does
not confirm an app defect: the press event never reached the app. The logs of the
attempts: [`tap-notification-attempt.log`](../evidence/2026-09-02-reminder-settings-notifications/tap-notification-attempt.log),
[`tap-notification-coordinate-attempt.log`](../evidence/2026-09-02-reminder-settings-notifications/tap-notification-coordinate-attempt.log).

To settle this point one has to tap a fresh notification manually on an unlocked
simulator or on a physical iPhone and check that the home screen of the app
opens.

## Environment limitation

The simulator confirms the creation of the system requests, the display and the
storage of a notification. The reliability of delivery after a long idle period
and after a reboot has to be verified separately on a physical iPhone.
