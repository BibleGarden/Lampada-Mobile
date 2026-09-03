# ADR-0013: Remind about prayer with local notifications on a "days x times" schedule

- Status: Accepted
- Date: 2026-08-30
- Participants: product owner, developer, QA lead

## Context

The app needs prayer reminders. Prayer is a personal practice, and the contents of
the schedule must not leave the device: no push token, and no call to a server at
the moment a reminder fires.

The schedule is defined by a simple choice of weekdays and times, but the next
stage has to put the parsing of an arbitrary phrase on top of the same schedule
("remind me on weekdays at 11 and 19, and at 22 on the weekend"). The simple
choice stays forever as the degradation for when the AI is unavailable. So the
schedule model and the scheduler have to be separated from the way the schedule
was defined.

Separate constraints that shape the decision:

- iOS keeps no more than 64 scheduled notifications per app.
- The text of a notification is handed to the system at scheduling time; it
  cannot be substituted at the moment of display.
- On Android 12+ exact alarms require `SCHEDULE_EXACT_ALARM`, a permission the
  store demands a justification for. A prayer reminder does not need
  second-level precision.
- The app already has the ongoing notification of the prayer timer (ADR-0010),
  with its own channel and its own native module.

## Decision

1. The schedule is a set of "weekdays x times" rules: `{ enabled, rules[] }`,
   where every rule holds ISO weekdays (1 = Monday) and a list of times. Several
   times a day are allowed. The model lives in `lib/prayerReminders.ts` and knows
   nothing about expo-notifications or react-native, so it is fully covered by
   unit tests and accepts a schedule from the interface and from the future
   phrase parsing alike.
2. The schedule is stored in `meta` as a single JSON value `prayer_reminders`,
   following the `scripture_preferences` pattern. The enabled flag, the days and
   the times are written atomically: a reader will never see reminders enabled
   with half a schedule.
3. The scheduling uses `expo-notifications` with WEEKLY triggers. Every
   "day x time" pair expands into one trigger; the system repeats it weekly by
   itself, so the schedule survives the app being unloaded and the device
   rebooting (`RECEIVE_BOOT_COMPLETED` comes from the library manifest).
4. There is no partial update: any change of the schedule and every app launch
   perform a full rescheduling - cancel our own notifications and schedule the
   set anew. The rescheduling on launch exists precisely for text rotation: the
   pool of short phrases is reshuffled on every scheduling.
5. The notification permission is requested exactly at the moment the user turns
   the reminders on themselves, not at app start. A refusal leaves the toggle off
   and is shown on the settings screen as text.
6. `SCHEDULE_EXACT_ALARM` is not requested: the time of a reminder does not have
   to be precise to the second.
7. The reminders live in their own Android channel `prayer_reminders` and are
   marked with `content.data.kind`. The scheduler cancels only the marked
   notifications, so the ongoing chronometer of the prayer timer (the
   `twinkler_prayer_timer` channel) is untouched.
8. Tapping a notification opens Home. The exception is an active prayer scenario
   (`/session`, `/reflect`, `/done`): it must not be left by an accidental
   action, so a reminder arriving during a prayer does not throw the user out of
   it.
9. Whether the person prayed that day is not taken into account: the reminder
   always arrives. `prayed_days` takes no part in the schedule.

## Options considered

### Server-side push notifications

Rejected. It would require a push token, a server scheduler and sending the
prayer schedule outside. For a personal practice that is an unjustified loss of
privacy and an extra dependency on the network at the moment of the reminder.

### A single DAILY trigger instead of a set of WEEKLY ones

Rejected. `DAILY` does not distinguish weekdays, while "Mon-Fri: 11:00 ·
Sat-Sun: 22:00" needs exactly that. A set of `WEEKLY` triggers expresses an
arbitrary rule and stays entirely system-side.

### A background task that schedules the nearest notification and fills in the text

Rejected. It would give a fresh phrase for every display, but would make the
delivery of a reminder depend on whether the OS wakes the background task up.
Reliability of delivery matters more than variety of text; rotation on
rescheduling gives enough variety without background code.

### Take `prayed_days` into account and stay silent if the person already prayed

Rejected by the product owner: a reminder is an invitation, not a compliance
check.

### Request the notification permission at app start

Rejected. A system prompt without explaining context is refused more often, and
on Android a refusal cannot be asked again. The request is tied to a deliberate
enabling of the reminders.

## Consequences

- The reminders work entirely offline and need neither push infrastructure nor a
  server-side schedule.
- The schedule survives an app restart and a device reboot, because the
  repetition is held by the system rather than by the app.
- Stage 2 adds only a new way to obtain a `ReminderSchedule`: the storage, the
  expansion into triggers, the scheduler and the degradation interface do not
  change.
- The text of a reminder changes no more often than a rescheduling happens. An
  app that has not been launched for a week will repeat the same phrases - an
  accepted trade-off for reliable delivery.
- The number of notifications is bounded: the interface allows several rules with
  up to 8 times each, while the expansion deduplicates identical "day x time"
  pairs and cuts everything beyond 64, the iOS limit.
- The reminder time is approximate: without `SCHEDULE_EXACT_ALARM` Android may
  shift the display, and Doze mode plus aggressive battery saving from particular
  vendors can delay it further.
- The native dependency `expo-notifications` was added, so verifying the
  reminders requires a new native build rather than only a JS bundle update.

## References

- [ADR-0010](0010-lock-screen-prayer-timer.md) - the ongoing notification of the
  prayer timer, a separate feature in a separate channel
- [expo-notifications, Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- `lib/prayerReminders.ts`, `lib/prayerReminderScheduler.ts`
