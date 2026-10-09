# Store materials

App Store materials are described first; Google Play has its own section at
the end.

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
`ru`, and `uk` files. Add a missing language in ASC before using any command;
other ASC locales are reported and left alone. Category IDs are
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

`pull` replaces source files from editable app info and the iOS version;
`diff` only reads;
`push` prints differences and requires `--yes` before writing changed fields.
Push is not atomic: it makes several PATCH requests; after a failure, run
`diff` to see which changes remain.
The script refuses to write without an editable version or when Apple's limits
are exceeded: name/subtitle 30 characters, promotional text 170, description and
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

## Google Play

`play/<locale>.json` holds the Play listing texts for `en-US`, `ru-RU` and
`uk`: `title` (30 characters), `shortDescription` (80) and `fullDescription`
(4,000). They are adapted from the App Store texts without iOS terms; Play has
no subtitle, keywords or promotional text. `npm test` checks the limits, the
locale set and the absence of Face ID, Touch ID and Apple product names. There
is no sync script: paste the texts into Play Console → Grow users → Store
presence → Main store listing. The category is Lifestyle.

### Play Console declarations

Verify the permissions against the merged release manifest (`PRE-004D`):

| Permission | Source | Purpose |
|---|---|---|
| `RECORD_AUDIO` | `app.json`, expo-audio | spoken answers, recorded only on the user's press |
| `POST_NOTIFICATIONS` | `app.json`, expo-notifications | prayer reminders and the timer notification |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | expo-audio `enableBackgroundPlayback` | music and Scripture narration continue in the background and on the lock screen |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | expo-notifications, WorkManager | rescheduling reminders after a restart |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | expo-local-authentication | the optional app lock |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE` | template and libraries | network requests, audio routing, haptics |

`SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`
must be absent (`android.blockedPermissions`).

**Foreground service.** App content → Foreground service permissions → Media
playback: background prayer music and Scripture narration that the user
started keep playing while the screen is locked or another app is open. Attach
a short video that starts music in a prayer, locks the screen and shows the
playback notification.

**Data safety.** These answers follow the consent texts in
`lib/locales/settings.ts` (`settings.privacyDetails` and the consent hints):

- Data is encrypted in transit. There are no accounts. The journal and
  recordings stay on the device and are deleted with a prayer or by the full
  reset.
- Collected, not shared: Google Gemini and the Whisper server act as service
  providers.
  - Audio → Voice or sound recordings: optional, processed ephemerally, App
    functionality. Sent only when the user asks for a transcription and has
    given transcription consent.
  - Messages → Other in-app messages, or App activity → Other user-generated
    content: the prayer topic, answers and transcripts. Optional, processed
    ephemerally, App functionality. Sent only with the topic and answer
    consents.
  - Content reports: the reported question or passage and an optional comment.
    Optional, stored on the server for moderation (App functionality).
  - Server logs: decide whether request logs count as App info and
    performance → Diagnostics.
- Not collected: location, contacts, photos, device or other identifiers,
  financial or health data, analytics.

Not in the repository yet: the 1024×500 feature graphic and Android phone
screenshots with an aspect ratio of at most 2:1. The App Store screenshots do
not fit and show the iOS interface.

### Build and submit

From the repository root:

```sh
npm run eas:production:android                     # new release, Android only
npm run eas:production:all                         # new release, both stores
npm run eas:production:android -- --keep-version   # Android for the release iOS already has
npx eas-cli@latest submit --platform android --profile production
```

The build uses the EAS `production` environment and produces an AAB; EAS
increments `versionCode` remotely. On the first Android build EAS offers to
generate the upload keystore; keep it in EAS. Play App Signing holds the app
signing key. The submit profile uploads to the `internal` track with
`releaseStatus: draft`; promote the release in Play Console. Uploading the
first AAB manually to internal testing in Play Console is the most predictable
start.

`eas submit` needs a Google Cloud service account that has access to the app in
Play Console → Users and permissions. Upload its JSON key to EAS, never to git:
`npx eas-cli@latest credentials --platform android` → `production` → Google
Service Account → Manage your Google Service Account Key for Play Store
Submissions → Set up a Google Service Account Key for Play Store Submissions.
EAS assigns the key to `com.nf404.twinkler`, so `eas.json` has no
`serviceAccountKeyPath`.
