# ADR-0016: Separate the voice recordings from the answer field

- Status: Accepted
- Date: 2026-09-01
- Participants: QA lead, product owner

## Context

ADR-0015 merged the answer field, the recording cards and the transcripts into a
single scrollable area. With a long transcript these elements compete for height
again: the answer field is lost among the cards, and the expanded text takes up
almost the whole screen. With the keyboard open there is even less room.

Starting and stopping a recording are asynchronous. If the interface relies only
on polling `useAudioRecorderState`, a window remains between the press and the
state update for a repeated `prepareToRecordAsync()` or `stop()`, and closing the
sheet can leave an unfinished start with no visible controls.

The audio mode in Expo is shared across the process. On iOS a late
`setAudioModeAsync({ allowsRecording: false })` from the background music or from
the scripture audio stops an active `AVAudioRecorder` outright. Local
serialization of start/stop is therefore not enough: every change of the global
mode has to have a single order and to know that the recording owns the audio
session.

## Decision

- `AnswerSheet` holds the question, a self-scrolling answer field and the action
  bar. The voice recordings are represented by a counter on the microphone
  button.
- The recording cards, the player, the transcript and the recording controls live
  in a separate `RecordingsSheet`, opened on top of the answer sheet.
- In the recordings sheet the transcript is shown as a compact read-only block.
  The "Add to the answer" action appends the text to the answer field and closes
  the upper sheet; editing then happens in the answer itself. This does not
  change the server boundary or the local storage defined by ADR-0002.
- Starting and stopping the recorder follow the single-flight principle. Any busy
  phase (`starting`, `recording`, `stopping`) blocks closing the upper sheet, and
  the pending phases block a repeated action immediately, without waiting for a
  poll of the native state.
- One start attempt performs exactly one `prepare` and one `record`. A failed
  native start is cleaned up completely; the retry is up to the user as a new
  attempt. A repeated `prepare` of the same iOS recorder is forbidden: a late
  delegate of the old `AVAudioRecorder` can reset the state of an already new
  recording.
- Closing the sheet invalidates an unfinished start. If the native recording did
  begin after the await, it is stopped immediately and never stays hidden.
- After a confirmed stop the app waits for the M4A metadata to settle. The
  integrity check uses only the presence and the minimum size of the container:
  the AAC bitrate is a target and depends on the device and the content. A
  suspicious file is not deleted automatically by a heuristic.
- The draft and scripture players are created with `keepAudioSessionActive`:
  their pause has no right to schedule a global deactivation of the
  `AVAudioSession` over a new recorder. An explicit deactivation of the music
  session goes through the same queue and is skipped while a recording lease is
  active.
- Scripture that is already sounding is stopped explicitly before a voice
  recording starts; playback of a draft also takes a grant from the coordinator
  and does not start after a recording has begun or after the sheet was closed.
- After `player.replace()` the playback of a draft waits until the new local
  `AVPlayerItem` becomes `isLoaded` and reports a non-zero duration, then seeks
  to the beginning explicitly. This is mandatory on physical iOS, where an
  immediate `play()` after a replace can be lost, even though the Simulator
  manages to load the file in time.
- Every `setAudioModeAsync` goes through the single `audioModeCoordinator`. The
  recording lease becomes active synchronously, waits for the mode changes
  already in flight and blocks new playback requests until a confirmed native
  stop.

## Options considered

### Keep the single scroll of ADR-0015

Rejected: the answer field and the recording cards keep competing for one visible
area, and a long transcript makes it harder to get back to the typed text.

### Always open the original sheet to 100%

Rejected: the visible context of the prayer and the timer is lost, and the
competition of the elements for height remains.

### Rely on `recorderState.isRecording` alone

Rejected: the state updates with a delay and does not protect the intervals
permission → prepare → record and stop → the file being finished.

### Guard only the music effect with a React flag

Rejected: a flag cancels the continuation of the effect, but it cannot cancel a
native `setAudioModeAsync` that already started. A belated playback mode can
still arrive after the recording mode and cut the file short.

## Consequences

- The answer field stays in place regardless of the number of recordings and the
  length of a transcript.
- The recordings get their own scroll and a separate UI lifecycle.
- Repeated fast presses do not create parallel native starts and stops.
- The music and the scripture audio cannot switch the audio mode during a
  recording.
- Closing the upper sheet requires handling a pending recorder operation
  explicitly.
- A failed native `stop` does not count as a confirmation that it stopped: the
  recording controls stay visible and available for another attempt.
- An error or a reset of the native recorder terminally removes the overlay and
  the recording lease; a late callback cannot leave a false active recording.
- An unexpected `isFinished` of the current recorder during the `recording` phase
  counts as an interruption even with `hasError: false`: Expo iOS does not
  surface `successfully=false` as an error. An expected finish during `stopping`
  and a late callback of an old recorder do not interrupt a new recording.
- ADR-0015 is superseded by this decision; ADR-0002 keeps defining the
  server-side transcription and the storage of its result.

## References

- Code: `components/AnswerSheet.tsx`, `components/RecordingsSheet.tsx`,
  `lib/audioModeCoordinator.ts`, `lib/recordingOperation.ts`,
  `lib/scriptureAudioOperation.ts`
- Expo SDK 57: `expo-audio`
