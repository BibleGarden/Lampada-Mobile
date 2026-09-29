# ADR-0036: Release the iOS audio session when its last consumer stops

- Status: Accepted
- Date: 2026-09-29
- Participants: product owner, developer

## Context

The app enables iOS background audio. In Expo Audio 57, playback and recorder
preparation activate `AVAudioSession`. Our players use
`keepAudioSessionActive: true` to avoid Expo's deferred deactivation racing
with a new recording. Stopping a recorder does not deactivate the session.
The former explicit deactivation belonged only to music, so narration, voice
drafts and recording could leave an idle app active in the background.

## Decision

`audioModeCoordinator` counts session leases for music, scripture narration,
draft playback and microphone recording. Each consumer acquires one before
native audio work and releases it after pause, completion, failure or exit.
If a recorder stop fails without confirming native shutdown, its lease stays
held until the existing visible retry or unmount cleanup resolves the recorder.
The last release queues `setIsAudioActiveAsync(false)` behind earlier mode
changes. A new lease acquired before that queued operation runs cancels the
deactivation; its mode request remains serialized after the queue. Native
deactivation errors reject the release operation. Every consumer logs that
rejection with `console.error`; cleanup never silently retries deactivation or
shows a technical message to the person praying.

Music keeps its lease through a crossfade and releases it after both players
pause. A prayer without a deadline has no automatic expiry: music continues
while that prayer is active and stops on the explicit finish, using the same
fade as a finite prayer. An arbitrary timeout would alter the listening
experience and would not represent prayer completion.

## Consequences

- An idle screen no longer keeps the audio session active solely because it is
  mounted. iOS can suspend the app after its last audio consumer stops.
- Background music and narration still continue while playing. A free prayer
  left unfinished with music on remains an active audio task until the owner
  finishes it or turns music off.
- The mode queue still gives recording priority, so a stale playback request
  cannot reconfigure an active recorder.
