# ADR-0010: Show the prayer timer on the locked screen

- Status: Accepted
- Date: 2026-08-29
- Participants: product owner, developer, QA lead

## Context

After ADR-0009 the music keeps playing in the background and provides system
media controls, but the prayer timer is visible only inside the app. A media
pause belongs semantically to the track and must not silently stop the prayer.
Per-second updates from JavaScript are unreliable once the screen is locked, so
the system surface has to count the time from the absolute deadline on its own.

## Decision

1. Keep the music and the prayer independent: media play/pause controls only the
   `AudioPlayer`; the system timer uses the `startedAtMs` and `endsAtMs` of the
   session.
2. On iOS 16.4+ use the official Expo SDK 57 `expo-widgets` and `@expo/ui`: a
   Live Activity displays a SwiftUI `Text(timerInterval:countsDown:)` on the Lock
   Screen and in the Dynamic Island. `staleDate` equals the deadline, so after
   zero the system can show a finished state without running JavaScript.
3. On Android use a local Expo Module and a separate low-importance ongoing
   notification. `Notification.Builder` gets `setWhen(endsAtMs)`,
   `setUsesChronometer(true)` and `setChronometerCountDown(true)`; no separate
   foreground service is created.
4. Start the system timer only for a finite prayer, update it after a manual
   change of the duration, and remove it on the transition to reflection, on
   finishing or on reset.
5. On Android request `POST_NOTIFICATIONS` at the first start of a finite
   prayer. A refusal does not block the prayer itself, but hides the system card.

## Options considered

### Show the time in the track metadata

Rejected: the Now Playing title and progress belong to the audio track, not to
the prayer; pausing the music would create an ambiguous link with the timer.

### Update the text once a second from JavaScript

Rejected: iOS and Android may suspend JavaScript in the background. The native
timer interval and chronometer count the seconds on the system side.

### Run an Android foreground service for the timer

Rejected: on Android 14+ a foreground service must have an allowed type, and an
ordinary prayer countdown fits none of the suitable ones. The `expo-audio` media
foreground service remains the responsibility of the music.

### A single cross-platform notification library

Rejected: an iOS Live Activity requires a WidgetKit extension, while the Android
countdown needs the system chronometer flags. A small platform layer preserves
the native semantics without a per-second scheduler and an extra external
runtime.

## Consequences

- The iOS deployment target is raised to 16.4; Expo Go no longer works for this
  feature, a new native build is required.
- `expo-widgets` creates a WidgetKit extension, the App Group `group.twinkler`
  and an extra bundle `twinkler.ExpoWidgetsTarget`; the signing of those targets
  has to be verified on a physical device and in EAS.
- The Expo Widgets plugin 57.0.15 adds the `aps-environment` entitlement even
  with push updates disabled; the local implementation uses no push tokens.
- The Android package is fixed for the first time as `com.nf404.twinkler`. It
  cannot be changed after publishing to Google Play without creating a new app.
- If the process is force-unloaded, the app does not restore the active session.
  The system card counts down to the deadline; the final cleanup also happens on
  the next launch or reset.
- Physical iPhone and Android devices remain mandatory for verifying the Lock
  Screen, the Dynamic Island, a permission denial and the interplay with the
  media controls.

## References

- [ADR-0009](0009-background-prayer-session.md)
- [Expo Widgets SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/)
- [Expo UI Text SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/text/)
