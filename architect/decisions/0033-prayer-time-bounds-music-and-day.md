# ADR-0033: Bound the music, the duration and the streak day by the prayer time

- Status: Accepted
- Date: 2026-09-23
- Participants: product owner, developer

## Context

A prayer with a timer and music was started, and the screen was locked. The music
kept playing after the deadline, and the prayer was confirmed on reflection the
next day. It was counted for that next day, which broke the streak.

- The music was stopped only on the transition to reflection. That transition is
  scheduled only while the app is `active` (ADR-0009), so in the background it
  never happened.
- While the music plays, iOS keeps the process running in the `audio` background
  mode: React Native timers keep firing, the one-second tick reaches zero, and the
  JavaScript crossfade keeps changing tracks. `expo-audio` 57 has no native
  scheduled stop for `AudioPlayer`.
- The saved duration was the wall-clock time from the start to the last tick, so
  a prayer left overnight was saved as almost a day long.
- `complete` marked `prayed_days` with the day of the tap on "Done", while the
  journal dates the prayer by `sessions.started_at`.

## Decision

1. When a finite prayer reaches its deadline while the app is not `active`, the
   session screen stops the music at once: it fades out over 3 s, then both
   players are paused, the music is turned off and the audio session is released.
   The transition to reflection still waits for the app to return, as before.
   Extending the timer while this fade still runs cancels it and restores the
   music volume. Once the music has stopped, extending does not turn it back on;
   the music button stays one tap away.
2. The music ends with a fade-out on the transition to reflection as well, but in
   0.8 s. The players belong to the session screen and are released when it
   unmounts, so the transition waits for the fade before `router.replace`; a
   longer fade would make the screen feel stuck after "Finish". The fade reuses
   the cosine volume curve and the 50 ms timer step of the track crossfade, and
   blocks crossfades while it runs. A second request never starts another fade:
   it can only shorten the running one, continuing from the current volume.
   Unmounting cancels the fade without touching the released players.
3. A completed prayer counts for the local calendar day of its start
   (`startedAtMs`). The day of the tap on "Done" is ignored. `startedAtMs` is
   taken once, before the session row is created, and the same instant is stored
   in `sessions.started_at`, so the flame and the journal cannot land on
   different days around midnight.
4. Completing without an active session is an error, not a silent mark of the
   current day.
5. The duration of a finite prayer is capped at its current deadline:
   `elapsed = min(now, endsAtMs) - startedAtMs`. Extending the timer moves the
   deadline and the cap; resuming from reflection sets a new deadline, and the
   time on reflection before it stays counted (ADR-0027). Waiting after zero, in
   the background or on reflection, is not counted. An untimed prayer keeps the
   wall-clock time from its start to the last tick of the session screen.

## Options considered

### Stop the music natively at the deadline

Rejected: `AudioPlayer` has no scheduled stop. A local native module would only
duplicate what the JavaScript tick already does: when there is music to stop, the
process is alive.

### Navigate at once and let the music fade on reflection

Rejected: `useAudioPlayer` releases the players when the session screen unmounts,
so the fade would be cut off. Moving the players to an owner outside the screen is
a larger change than the fade itself.

### Count the prayer for the day of its deadline

Rejected: an untimed prayer has no deadline, and a prayer resumed from reflection
(ADR-0027) gets a new one. The start is the one moment every prayer has; it is
also the date the journal shows, so the flame and the journal agree.

### Also stop the music at the deadline in the foreground

Rejected for now: while a sheet or narration keeps the prayer open after zero,
the music keeps accompanying it, and it stops on the transition to reflection.

## Consequences

- The locked screen goes quiet at the deadline, and the audio session is released,
  so iOS may then suspend the app. The Live Activity shows the finished state on
  its own (ADR-0010).
- A prayer started before midnight and completed after it counts only for the
  previous day.
- The time spent reading or answering after zero, without extending the timer,
  is not part of the saved duration.
- Finishing a prayer with music takes 0.8 s longer before reflection opens.
- Moving the players out of the session screen would allow a longer fade on the
  transition without waiting; it is not done here.
- `testing/e2e/run-background-music-timer-end.sh` checks the stop on the
  simulator after sending the app to the background; the locked screen of a
  physical iPhone stays a manual check.

## References

- ClickUp: 123pfqn0082
- [ADR-0009](0009-background-prayer-session.md),
  [ADR-0010](0010-lock-screen-prayer-timer.md),
  [ADR-0027](0027-resume-current-prayer.md)
