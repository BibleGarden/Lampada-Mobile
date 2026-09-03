# ADR-0009: Count the timer by the clock and play the music in the background

- Status: Accepted
- Date: 2026-08-29
- Participants: product owner, developer, QA lead

## Context

The prayer timer was decremented by a one-second JavaScript interval, and the
music was paused explicitly when the app went into the background. A mobile OS
can slow JavaScript down or stop it entirely after the app is backgrounded, so
the timer lost the time that passed. For durable background audio Expo SDK 57
requires an active audio session, native background playback configuration and,
on Android, registering the player as a system media session.

## Decision

1. Keep the absolute `startedAtMs` and `endsAtMs` in the runtime state, and
   compute `elapsed` and `remaining` from `Date.now()`. The one-second interval
   remains only a mechanism for updating the interface; on returning to `active`
   an immediate synchronisation is performed.
2. Play the local queue through an `expo-audio` `AudioPlayer`, enable
   `shouldPlayInBackground` and register the active track for the system media
   session. When a track ends, JavaScript moves the player to the next item of
   the same random looping queue.
3. Enable `enableBackgroundPlayback` explicitly in the config plugin. The change
   requires a new native build; Expo Go is not a valid environment to verify it.
4. Keep the temporary audio focus of recording and scripture narration: during
   those actions the music and its system controls are turned off, and the music
   background mode is restored afterwards.

## Options considered

### Keep the one-second interval and catch up on the missed ticks

Rejected: the OS is not obliged to report how many callbacks were missed, and the
accumulated error stays dependent on the JavaScript scheduler.

### Keep `AudioPlaylist` and only enable `shouldPlayInBackground`

Rejected: on Android, Expo SDK 57 requires `setActiveForLockScreen` for durable
playback beyond roughly three minutes, and `AudioPlaylist` has no such API.

### Add a separate background task for the timer

Rejected: periodic background tasks do not guarantee a one-second cadence. For a
visible timer, recomputing from the absolute clock after returning is enough.

## Consequences

- The timer correctly catches up after the background, as long as the app process
  is alive.
- The music can continue while the screen is locked; Android shows a system media
  notification, iOS the Now Playing information and controls.
- If the OS unloaded the process, an active session is not restored yet.
- Reaching zero in the background does not trigger navigation by itself: the
  finish is handled after JavaScript resumes. A notification about the end
  remains a separate task.
- Background audio and the transitions between tracks require a manual check on a
  native build.

## References

- [Expo Audio SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- [`architect/README.md`](../README.md)
