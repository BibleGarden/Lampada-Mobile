# App Store materials

`screenshots/` holds App Store Connect screenshots named
`<device>-<language>-<NN>-<screen>.png`. The current set was captured on
2026-09-20 and predates the 2026-09-22/23 accessibility changes. Retake it
after visible interface changes.

## App Store page texts

`metadata/<locale>.json` holds each locale's app info and version text;
`metadata/app.json` holds App Store category IDs, copyright, and the content
rights declaration. JSON keeps
the whole page in one editable format, including descriptions. The locale
files determine which locales are synced; the initial `pull` creates `en-US`,
`ru`, and `uk` files. Add a missing language in ASC before using `diff` or
`push`; other ASC locales are reported and left alone. Category IDs are
checked against Apple's iOS category list before any write.

Set `ASC_ISSUER_ID` and `ASC_KEY_ID` in `~/.zshenv`. Find the Issuer ID and
active team key ID in ASC → Users and Access → Integrations → App Store
Connect API. Set `ASC_PRIVATE_KEY_PATH` only if the key is outside
`~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8`. Never commit keys.
From the repository root:

```sh
source ~/.zshenv
python3 scripts/appstore-metadata.py pull
python3 scripts/appstore-metadata.py diff
python3 scripts/appstore-metadata.py push --yes
```

`pull` replaces source files from the editable iOS version; `diff` only reads;
`push` prints differences and requires `--yes` before writing changed fields.
It refuses to write without an editable version or when Apple's limits are
exceeded: name/subtitle 30 characters, promotional text 170, description and
What's New 4,000 each, keywords 100. Apple's reference says keywords are
limited to 100 bytes, but ASC accepted 178-byte (94-character) Cyrillic
keywords on 2026-09-28, so all limits are checked in characters.

## App preview video

From the repository root:

```sh
python3 scripts/run-appstore-video.py ru
python3 scripts/run-appstore-video.py ru --device ipad
```

Use `uk`, `en`, or `all` instead of `ru`. iPhone is the default device;
`--device ipad` uses the same build, capture, montage, and verification pipeline
with the iPad device profile in `video/pacing.json`. The script checks its tools,
exports the current JS with the mock build variables and compares its SHA-256
and a fingerprint of the generated iOS project and locked native dependencies
with the installed simulator app. Both must match to skip the Release build
and installation. Otherwise it uses a matching cached app or rebuilds and
installs. Before fingerprinting, the script always runs
`npx expo prebuild --platform ios` without `--clean`, even when the workspace
already exists. This keeps generated native files in sync with Expo config and
plugins without maintaining a separate config cache. The report's `source_hash`
is calculated after prebuild, so its `Info.plist` input is the generated one;
the rest of the native tree is covered by the native fingerprint. Prebuild
assigns new random PBX IDs on each run, so the native fingerprint hashes
`project.pbxproj` with those IDs replaced and its lines sorted: build settings,
source lists and resources still count, the random IDs do not.
The script stops if prebuild fails. It creates and installs a SQLite fixture, calibrates AXe,
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
or `Lampada AppStore iPad Pro 13` simulator, FFmpeg (`brew install ffmpeg`), and AXe **1.8.0**
(`brew install cameroncooke/axe/axe`). The script builds ShowTime from
commit `8fdd276e8cbf7281d6bb372e7caf990397d3c2e9` with the short-tap
indicator patch; Git and network access are needed on the first run.
No EAS or `.env.local` values are used. The build sets a local mock URL,
non-secret mock key, and `EXPO_PUBLIC_APPSTORE_VIDEO=1`.

Verified iPhone deliverables are written to `store/video/appstore-<locale>.mp4`;
iPad deliverables use `store/video/appstore-ipad-<locale>.mp4`. The iPad profile
records portrait 1200×1600 video. Apple confirmed this size, the 15–30 second
range, H.264 High up to Level 4.0, 30 fps maximum, and stereo AAC in its
[App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications/)
on 2026-09-27. The device profile supplies the simulator name, output size,
and verification crops for the first question, three typing fields, and flame.
It also sets HID key intervals and typing-only montage speed. For intention
and answer, iPad uses 100 ms and 3.8×; iPhone uses 85 ms and 3.25×. Both
profiles display approximately 26 ms per typed character. On 2026-09-27, a
short iPad recording of the Russian intention measured
17, 25, 25, and 25 visible updates (19 required) at 65, 85, 100, and 120 ms,
respectively. The 100 ms take had a 133 ms maximum gap, giving 117 ms of margin
below the 250 ms gate; 85 ms had a 200 ms maximum gap. On the named iPhone,
65, 85, and 100 ms yielded 25, 27, and 27 updates (19 required), with maximum
gaps of 167, 133, and 133 ms. The 85 ms interval is the fastest with more than
100 ms of margin to the gap gate; earlier full iPhone runs at 65 ms needed
multiple takes.
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
montage speed, device profiles, and verification thresholds in
`video/pacing.json`. For a new
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
more than `clock_sync.sync_tolerance_frames` times the measured 95th-percentile
raw frame interval, and repairs any backward raw PTS jump before montage.
The clock-sync report records both tap offsets, the measured interval, the
derived tolerance, PTS jumps, and the first tap in the second AXe batch,
whose verbose line arrives late. Sync disagreement stops the run without a
retake and saves the measured offsets and tolerance in that report.

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
Each ShowTime tap onset is quantized to a raw frame, so two offset measurements
can differ by two frame intervals; question visibility detection is coarser
still. Ordinary builds keep the
animated flame. Review the uncut copy and final video before submitting to
App Store Connect.

### Known issues

- Simulator recording can stall for 500–650 ms between visible typing updates,
  historically most often in English at the 65 ms iPhone key interval
  (raw typing metrics, 2026-09-27). With the 85 ms iPhone profile, ru, uk, and
  en each passed their first full capture on 2026-09-27. The quality gate still
  records up to three takes if a recording stalls. If all fail,
  inspect `pipeline-report.json` for each attempt's
  `quality_rejected` reasons and the typing metrics under `frames/<locale>/`;
  try again later on an idle machine or reboot the named simulator before a new
  run. Do not retry a failed run without the owner's permission.
- On iPad, the question and scripture share a centered lower card, while the
  answer opens as a full-width bottom sheet. The journal uses a centered
  column with wide side margins. Its portrait output and verification crops
  differ from iPhone; check the saved review frames if
  the layout changes. AXe may briefly fail immediately after app launch while
  the iPad accessibility tree appears; the runner waits for the home control.

The montage targets at most 28.5 seconds to leave room below Apple's 30-second
limit. Its duration metric reports the remaining margin and warns within one
second of that limit; only the 15–30 second range is a hard duration gate.
Capture lengths vary with AXe action latency, mock response timing, screenshot
polling for the first visible question, and simulator frame timestamps. The
recorded action waits and reading holds use the configured values. The first
question also has a live visual match during recording. Montage speed on typing
and transitions provides the duration margin.
