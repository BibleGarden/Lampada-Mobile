# Recording pause and resume

Verified on 2026-09-11 against Expo SDK 57 audio documentation and the local
development app on an iPad (A16) simulator running iOS 26.5.

## Behavior

The recordings sheet retains the paused recording separately from the playing
recording. Resuming uses the loaded native player item without replacing it or
seeking to zero. The paused row keeps its elapsed time and progress bar.
Switching recordings, replaying after completion and reopening the sheet start
from zero. Closing the sheet or starting a recording invalidates pending playback.

## Checks

- `npm run typecheck`: passed, exit 0.
- Audio player operation and audio mode coordinator tests: 16 passed, exit 0.
  New regression cases cover resuming without replacing or seeking, restarting
  from zero, closing during resume and cancellation during the initial seek.
- `git diff --check`: passed, exit 0.
- Native playback through the actual `AnswerSheet` and `RecordingsSheet`:
  paused at 0:21, remained at 0:21 while idle, then resumed and advanced to 0:22.
- After reaching the 0:30 end, Play restarted at 0:00.
- Switching to recording 2 started at 0:00 and reset recording 1's progress.

The native check used two synthetic recording entries and a generated 30-second
silent WAV file, without microphone access, uploads or saved journal changes.
The temporary preview route and audio file were removed afterward. Physical
devices, audible output and the separate journal player were not exercised.

## Evidence

- [Paused at 0:21](../evidence/2026-09-11-recording-resume/paused.png)
- [Completed playback](../evidence/2026-09-11-recording-resume/completed.png)

Full check output was retained in `/tmp/pray-recording-resume-tests.log` and
`/tmp/pray-recording-resume-typecheck-final.log`.
