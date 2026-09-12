# Reminder editor appearance

Verified on 2026-09-12 using the actual settings screen in local Debug builds
connected to Metro, with Expo SDK 57 and iOS 26.5 simulators.

## Changes

- Shared settings icons scale once. The sheet close button is more compact.
- Days and times use separate sections without an enclosing card border.
- Centered hour and minute controls emphasize the digits. Add-time and removal
  actions use smaller icons; touch areas remain separate from icon dimensions.
- Settings sheets have a responsive maximum width on wide tablets.

## Verification

- iPad (A16), Russian: portrait and landscape layouts fit without clipping.
- iPad: hour and five-minute steps, weekday selection, adding and removing a
  second time, Done, reopening the schedule and closing with the cross work.
- Pray SE, English: all seven days, two time rows and their removal buttons fit
  on the narrow screen; adding, removing and Done work.
- Both simulator schedules were restored to their initial state: every day at
  09:00, reminders disabled. Notification delivery was not exercised.
- `npm run typecheck`: passed, exit 0.
- `git diff --check`: passed, exit 0.

## Evidence

- [iPad portrait](../evidence/2026-09-12-reminder-editor/ipad-portrait.png)
- [iPad with two times](../evidence/2026-09-12-reminder-editor/ipad-multiple-times.png)
- [iPad landscape](../evidence/2026-09-12-reminder-editor/ipad-landscape.png)
- [iPhone SE with two times](../evidence/2026-09-12-reminder-editor/iphone-se-multiple-times.png)
