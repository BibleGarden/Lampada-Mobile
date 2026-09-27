# App Store materials

`screenshots/` holds App Store Connect screenshots named
`<device>-<language>-<NN>-<screen>.png`. The current set was captured on
2026-09-20 and predates the 2026-09-22/23 accessibility changes. Retake it
after visible interface changes.

## App preview video

From the repository root:

```sh
python3 scripts/run-appstore-video.py ru
```

Use `uk`, `en`, or `all` instead of `ru`. The script checks its tools,
exports the current JS with the mock build variables and compares its SHA-256
and a fingerprint of the generated iOS project and locked native dependencies
with the installed simulator app. Both must match to skip the Release build
and installation. Otherwise it uses a matching cached app or rebuilds and
installs. Before fingerprinting, the script always runs
`npx expo prebuild --platform ios` without `--clean`, even when the workspace
already exists. This keeps generated native files in sync with Expo config and
plugins without maintaining a separate config cache. The report's `source_hash`
is calculated after prebuild, so its `Info.plist` and `project.pbxproj` inputs
are the generated ones; the rest of the native tree is covered by the native
fingerprint. The
script stops if prebuild fails. It creates
and installs a SQLite fixture, calibrates AXe,
records one continuous take, edits it, and verifies the final video. A take
rejected only by recording quality checks is automatically recorded again,
up to `verification.max_capture_attempts` in `video/pacing.json` (currently 3).
Retakes reuse the build and calibration, restore the original seed database,
and keep separate logs and results for every attempt. Build, seed, text,
marker, sync, configured pause, and App Store format failures stop immediately. A final MP4 is
replaced only after all hard checks pass. The simulator is shut down and the
mock server and recorder are stopped on exit.

Prerequisites: macOS, Xcode with command-line tools, Node dependencies
(`npm ci`), CocoaPods, the named `Lampada AppStore UK iPhone 17 Pro Max`
simulator, FFmpeg (`brew install ffmpeg`), and AXe **1.8.0**
(`brew install cameroncooke/axe/axe`). The script builds ShowTime from
commit `8fdd276e8cbf7281d6bb372e7caf990397d3c2e9` with the short-tap
indicator patch; Git and network access are needed on the first run.
No EAS or `.env.local` values are used. The build sets a local mock URL,
non-secret mock key, and `EXPO_PUBLIC_APPSTORE_VIDEO=1`.

Verified deliverables are written to `store/video/appstore-<locale>.mp4`.
Raw footage, the uncut review copy, frames, full logs, exit codes, typing
metrics, and `pipeline-report.json` are kept under the ignored
`store/video/runs/<timestamp>/` directory, with separate attempt directories
and reasons in the report. Build and ShowTime caches are also
under `store/video/runs/`. Use `--work-root /absolute/path` to put all working
files and caches elsewhere. The report records whether the app was rebuilt.
Only the two JSON configurations and final MP4s in `store/video/` are
trackable by git.

Change spoken and typed copy, journal seed, API responses, and locale capture
labels in `video/demo-content.json`. Change typing rate, pauses, mock latency,
montage speed, and verification thresholds in `video/pacing.json`. For a new
locale, first add the app's normal localization, then add a matching locale
object with `capture`, `typed`, `seed`, `questions`, `catalog`, and
`passages` fields. The mock validates the fixture before building. Russian
on-camera copy was approved by the owner; Ukrainian and English copy was
delegated to the orchestrator on 2026-09-27. The book names, translations, and
off-camera John 3:16 texts were checked against the real API catalog and
excerpt endpoints on 2026-09-27.

The first-question reading pause starts when the recorded screen matches the
fully visible question frame saved during calibration. Its hold duration and
visual-match settings live in `video/pacing.json`; mock response delays are
fixed there as well. After recording, the runner detects the first two
ShowTime tap circles in the raw video, rejects clock offsets that differ by
more than one 30 fps frame, and repairs any backward raw PTS jump before
montage. The clock-sync report includes the detected offsets, PTS jumps, and
the first tap in the second AXe batch, whose verbose line arrives late.

AXe sends physical hardware-keyboard events because simulator paste hides
the typing animation. Before building, the script reads the installed Apple
keyboard-layout definitions through Xcode and checks every character of each
locale's typed demo copy. The video-only flag holds the Skia flame on its current
frame while the reflection input is focused; this keeps each character visible
in the recording. Hard checks reject invalid App Store encoding or duration,
missing or inconsistent markers, missing expected copy, and gross pacing
failures: every non-whitespace typed character needs a visible update in the
raw recording, raw and final typing gaps must stay within 250 ms, the first
question must read clearly for 0.8–2.5 seconds, and comprehension pauses
must stay within the bounds in
`video/pacing.json`. The montage can skip intermediate typing frames when it
speeds up a segment. The report and final console summary record each field's
raw and final maximum and p95 typing gaps, holds, and flame motion without
failing on small timing differences. The 150 ms typing smoothness expectation
in ANS-034 remains a reported metric, not the video pipeline's hard gate.
Simulator recording varies by about one
30 fps frame;
question visibility detection is coarser still. Ordinary builds keep the
animated flame. Review the uncut copy and final video before submitting to
App Store Connect.

The montage targets at most 28.5 seconds to leave room below Apple's 30-second
limit. Its duration metric reports the remaining margin and warns within one
second of that limit; only the 15–30 second range is a hard duration gate.
Capture lengths vary with AXe action latency, mock response timing, screenshot
polling for the first visible question, and simulator frame timestamps. The
recorded action waits and reading holds use the configured values. The first
question also has a live visual match during recording. Montage speed on typing
and transitions provides the duration margin.
