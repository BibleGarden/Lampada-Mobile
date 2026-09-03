# The timer and the music in the background - verification report

- Date: 2026-08-29
- Task: ClickUp `86cbbm5xd`
- Manual verification environment: iPhone 17 Pro Simulator, iOS 26.5, a native
  development build
- Expo: SDK 57.0.0, `expo-audio` 57.0.4

## What was implemented

- The timer computes `elapsed` and `remaining` from the absolute moments of the
  start and the end, and synchronises immediately on returning to `active`.
- The music is no longer paused because of `AppState.background`.
- The music queue uses an `AudioPlayer`, registers the active track as a system
  media session and restores the background audio mode after the temporary audio
  focus of a recording or of the scripture narration.
- The config plugin enables native background playback explicitly.

## Automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS, exit 0 | `testing/evidence/2026-08-29-background/typecheck.log` |
| `npm test` | PASS, 68/68, exit 0 | `testing/evidence/2026-08-29-background/tests.log` |
| `npx expo config --type public` | PASS, the background permissions are present | `testing/evidence/2026-08-29-background/expo-config.log` |

Four new unit tests cover the wall-clock computation, catching up after the
background, the mode without a timer and the lower bound of a manual correction.

## Manual smoke on the iOS Simulator

### Music

1. A five-minute prayer was started and the quiet music turned on.
2. The app was backgrounded with the Home button.
3. After a pause the same process was brought back with
   `launchApp.stopApp: false`.
4. The UI shows active playback (`Тихая музыка`) and the music switch; the timer
   caught up with the time spent in the background.

Result: PASS. Evidence:

- `maestro-music-background.log`, `maestro-music-resume.log`;
- `BG-MUSIC-resumed-playing.png`.

### The timer

1. The finite timer was reduced to five seconds.
2. Before it reached zero the app was backgrounded with the Home button.
3. After a pause the same process was brought back without a restart.
4. The app had already moved to the reflection: `Завершить` and `Вернуться к
   молитве` are visible.

Result: PASS. Evidence:

- `maestro-timer-background.log`, `maestro-timer-resume.log`;
- `BG-TIMER-resumed-at-zero.png`.

## What still cannot count as verified

- The simulator does not confirm that the sound is physically audible with the
  screen locked.
- A native release or dev build on a physical iPhone is needed: music for 5+
  minutes under the lock, returning to the app, pausing and finishing the
  session.
- A separate Android device is needed: the media notification, playback for 5+
  minutes, the transition between tracks and the return after the background.
- In the development build a LogBox toast appeared from an existing
  `console.warn` during the network fallback of the questions. No background
  audio errors were found in the native system log; this is not a verification of
  a release build.

Until the physical retest the task is not moved to `complete`.
