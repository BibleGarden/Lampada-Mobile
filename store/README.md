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

The package name is `app.lampada`; the listing URL is
`https://play.google.com/store/apps/details?id=app.lampada`. Play binds the app
to it with the first upload, so it can no longer change (ADR-0040). The iOS
bundle identifier stays `twinkler`.

`play/<locale>.json` holds the Play listing texts for `en-US`, `ru-RU` and
`uk`: `title` (30 characters), `shortDescription` (80) and `fullDescription`
(4,000). They are adapted from the App Store texts without iOS terms; Play has
no subtitle, keywords or promotional text. `npm test` checks the limits, the
locale set and the absence of Face ID, Touch ID and Apple product names. There
is no sync script: paste the texts into Play Console → Grow users → Store
presence → Main store listing. The category is Lifestyle.

### Play Console declarations

Checked against Google's official guidance on **2026-10-12**. Complete app setup
before starting a closed test; complete production access separately after the
test. Sources: [App content](https://support.google.com/googleplay/android-developer/answer/9859455),
[Data safety](https://support.google.com/googleplay/android-developer/answer/10787469),
[content ratings](https://support.google.com/googleplay/android-developer/answer/9859655),
[target audience](https://support.google.com/googleplay/android-developer/answer/9867159),
[store assets](https://support.google.com/googleplay/android-developer/answer/1078870),
[foreground service declaration](https://support.google.com/googleplay/android-developer/answer/13392821),
and [AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/13985936).

| Play Console item | Select or enter | Basis |
|---|---|---|
| App details | App; free; Lifestyle. **Owner decision:** confirm free pricing and distribution countries. | `store/play/en-US.json` describes a prayer app; `store/README.md` sets Lifestyle. |
| Privacy policy | `https://lampada.app/privacy?lang=en` (live on 2026-10-12). Settings links to the full policy in the interface language; its data-processing text remains a summary. | `store/metadata/en-US.json`; `settings-privacy-policy` and `lib/locales/settings.ts`. |
| App access / sign-in details | **All functionality is available without special access**; no reviewer credentials. The optional local PIN/biometric lock is user-created. | `app/setup.tsx`, `components/LockGate.tsx`, `architect/README.md` (lock gate). |
| Ads | **No, my app does not contain ads.** | `package.json` has no ad SDK; `store/play/en-US.json` describes no ads or sponsored placements. |
| Store listing contact | **Owner decision:** enter a monitored support email; recommend `support@lampada.app` if the owner controls it. | `store/metadata/en-US.json` points to the live privacy policy, which currently names that support address; no contact email is stored in this repository. |
| Target audience and content | **Owner decision:** recommend **18 and over only**; do not select child age groups unless the product is deliberately designed and reviewed for children. Answer **No** to primarily appealing to children with the current listing. | `store/play/en-US.json` addresses personal prayer and adult concerns; there is no age gate in `app/setup.tsx`. |
| Content ratings (IARC) | Choose **App**, then answer the live questionnaire truthfully: religious/Bible content **Yes** where asked; public user interaction / user-posted content **No**; user text remains private except explicit system sharing; AI-generated questions **Yes** where asked, with an in-app report control. **Owner decision:** review the final questionnaire and assigned ratings for each region; they cannot be predetermined from source. | `store/play/en-US.json`, `architect/README.md` (AI and sharing), `components/ContentReportDialog.tsx`, `lib/contentReportClient.ts`. |
| AI-generated content | The app generates questions with AI and provides an in-app report control. **Owner decision:** for each Play listing image or video, check the AI-label box only if that submitted asset is in scope for AI-generated asset labeling. | `lib/ai.ts`, `components/ContentReportDialog.tsx`; [AI content policy](https://support.google.com/googleplay/android-developer/answer/13985936) and [asset declaration](https://support.google.com/googleplay/android-developer/answer/17262077). |
| Data safety | **Yes**, data is collected off device; **No**, it is not shared with third parties when Gemini/Whisper act solely as service providers; **Yes**, data is encrypted in transit. Declare optional audio and text as below. **Owner decision:** verify server retention/logging and the final AAB's SDK inventory before submitting. | `lib/locales/settings.ts`, `lib/llm.ts`, `lib/transcription.ts`, `lib/contentReportClient.ts`; [Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469#collection). |
| Financial features | **My app doesn’t provide any financial features.** This form also applies to closed testing. | `store/play/en-US.json`; [Google's declaration choices](https://support.google.com/googleplay/android-developer/answer/13849271). |
| Health apps | **My app doesn’t provide any health features.** Prayer is the purpose; there are no health claims, health data integrations or medical features. This form also applies to closed testing. | `store/play/en-US.json`, `app.json`; [Google's declaration choices](https://support.google.com/googleplay/android-developer/answer/14738291). |
| Government apps / news and magazines / COVID-19 | **No** to each if shown. Lampada is not government affiliated and provides no government information, news or contact tracing. | `store/play/en-US.json`, `architect/README.md`; [App content guidance](https://support.google.com/googleplay/android-developer/answer/9859455). |
| Advertising ID | **No** for the local release merged manifest checked on 2026-10-13; confirm the uploaded AAB manifest before submission. | The local release merged manifest has no `com.google.android.gms.permission.AD_ID`; `package.json` has no ad SDK. |
| Foreground service permissions | **Media playback** only; use the explanation and video below. | `app.json` enables expo-audio background playback; `architect/README.md` documents music and Scripture narration. |

The [App content page](https://support.google.com/googleplay/android-developer/answer/9859455)
requires the privacy policy, ads, access, target audience and content rating
declarations; answer any additional card Play Console presents for the uploaded
bundle. The IARC questionnaire determines the actual regional ratings. Do not
claim a rating in advance.

Verify the permissions against the merged release manifest (`PRE-004D`):

| Permission | Source | Purpose |
|---|---|---|
| `RECORD_AUDIO` | `app.json`, expo-audio | spoken answers, recorded only on the user's press |
| `POST_NOTIFICATIONS` | `app.json`, expo-notifications | prayer reminders, the prayer countdown notification (`modules/prayer-timer-notification`) and the background music playback notification |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | expo-audio `enableBackgroundPlayback` | music and Scripture narration continue in the background and on the lock screen |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | expo-notifications, WorkManager | rescheduling reminders after a restart |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | expo-local-authentication | the optional app lock |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE` | template and libraries | network requests, audio routing, haptics |
| `app.lampada.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX | restricts the app's internal dynamically registered receivers |

`android.blockedPermissions` excludes unused `SYSTEM_ALERT_WINDOW`, storage, FCM
`com.google.android.c2dm.permission.RECEIVE`, install referrer
`BIND_GET_INSTALL_REFERRER_SERVICE`, and 16 launcher badge permissions.
The app schedules local notifications only (`lib/prayerReminderScheduler.ts`)
and never requests a push token or an install referrer. The merged Release
manifest, checked on 2026-10-13 after prebuild and `assembleRelease`, must
contain none of these or `com.google.android.gms.permission.AD_ID`.

**Foreground service.** App content → Foreground service permissions → Media
playback: background prayer music and Scripture narration that the user
started keep playing while the screen is locked or another app is open. Attach
a short video that starts music in a prayer, locks the screen and shows the
playback notification. If deferred, playback does not continue promptly after
the app backgrounds; if interrupted, the prayer loses continuous music or
narration and the user may need to resume it. Android's media playback type uses
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` ([Android documentation](https://developer.android.com/develop/background-work/services/fgs/service-types#media));
[Play requires](https://support.google.com/googleplay/android-developer/answer/13392821)
the use case, interruption impact and demo video in its declaration.

**Data safety.** These answers follow the consent texts in
`lib/locales/settings.ts` (`settings.privacyDetails` and the consent hints):

- Data is encrypted in transit. There are no accounts. The journal and
  recordings stay on the device and are deleted with a prayer or by the full
  reset.
- Android Auto Backup is on (ADR-0040). A backup to the user's own Google
  account is not collection by the developer: do not declare it as collected
  data. Mention it in the privacy policy and listing notes: the journal text
  and transcripts may be restored from the user's Google backup; the app
  sends the journal to that backup only end-to-end encrypted, which Android
  does when the device has a screen lock, and not at all on Android 7–8.1;
  voice recordings are never in the cloud backup and move only with a direct
  transfer to a new phone (Android 9 and later); the app PIN is never
  restored.
- Collected in the form, not shared if Google Gemini and the Whisper server
  act solely as service providers. Ephemeral processing is still entered in
  the form, though Google may omit it from the public Data safety section
  ([Google's definition](https://support.google.com/googleplay/android-developer/answer/10787469#collection)).
  - Audio → Voice or sound recordings: optional, processed ephemerally, App
    functionality. Sent only when the user asks for a transcription and has
    given transcription consent.
  - App activity → Other user-generated content: the prayer topic, answers
    and transcripts. Optional, processed ephemerally, App functionality. Sent
    only with the topic and answer consents (`lib/locales/settings.ts`).
  - App activity → Other user-generated content: an explicitly reported AI
    question or Scripture passage and optional comment. Optional, retained
    on the server for moderation, App functionality (`lib/contentReportClient.ts`).
  - **Owner decision:** inspect server request logs and retention. If they
    contain diagnostic data or device identifiers, declare the corresponding
    Diagnostics and/or Device or other IDs types;
    do not mark retained logs as ephemeral (`architect/README.md` documents
    the API, not its server logging policy).
- **Owner decision:** confirm the Data safety deletion-request answer after
  checking whether retained server reports can be deleted on request. Local
  journal deletion and reset do not by themselves erase server reports
  (`lib/contentReportClient.ts`, `architect/README.md`).
- No app-level collection of location, contacts, photos, financial or health
  data, analytics or device identifiers (`package.json`, `app.json`); confirm
  the server-log answer above before selecting **No** for identifiers.

**Store listing assets.** The [Play asset requirements](https://support.google.com/googleplay/android-developer/answer/1078870)
call for a 512×512 high-resolution icon (32-bit PNG with alpha, at most 1 MB), a required
1024×500 feature graphic (JPEG or 24-bit PNG without alpha), and at least two
screenshots across supported device types (JPEG or 24-bit PNG, 320–3840 px,
longest side at most twice the shortest). Use Android phone screenshots for
Lampada. The 7-inch and 10-inch tablet screenshot slots are **optional for
publication**; add them for the tablet listing. Four 1080 px screenshots per
device type are recommended for discovery, not a release gate.
`play/icon-512.png` (32-bit RGBA, from `assets/icon.png`) and the
owner-approved feature graphics `play/feature-graphic-{ru,uk,en}.png` (24-bit,
source `play/feature-graphic.html`) are rendered by
`scripts/render-play-feature-graphic.sh` (headless Google Chrome); upload each
graphic to its listing language.

Not in the repository yet: Android tablet screenshots, the uploaded AAB's
merged permission list, and evidence of the server's request-log retention. The App Store screenshots show iOS UI and are
not suitable for the Play listing.

### Android screenshots

Play accepts phone screenshots only at 16:9 or 9:16, each side 320–3840 px.
The 24 `ru`, `uk` and `en` images in `screenshots/android-phone-*.png` were
captured on 2026-10-14 at 1440×2560 (9:16), checked from each PNG header and
visually reviewed against the approved scenes. Their Play-only copy lives in
`screenshots/android-fixtures/`; the capture script builds a complete fixture
from `video/demo-content.json`. The prayer timer and saved duration vary with
emulator speed; the screens and fixture content are the stable references.
`scripts/capture-play-screenshots.sh <ru|uk|en>` uses a test-channel Release APK
against the shared `scripts/appstore-video-mock.py`, seeds the signed test
database, and runs `testing/screens/play-screens-{1,2}.yaml`. It writes eight
PNGs and full logs to a printed temporary directory for review, fails if any
PNG is not exactly 1440×2560, and does not overwrite approved images. Do not
run capture just to check the tooling.

Build the capture APK and signed database probe once with the script's mock
build variables, then set `PLAY_CAPTURE_APK` and `PLAY_CAPTURE_PROBE_APK` to
those files for all three language runs. Both paths are required together;
without them the script builds both APKs. Gradle is stopped before capture.
Run one language at a time and let the guest settle before each run.

Use only `emulator-5554` running the `Pray_Pixel_API_35` AVD. Start it as in
`testing/README.md` after `setopt NO_BG_NICE`; set
`ANDROID_HOME=~/Library/Android/sdk` before invoking the script. The script
sets `wm size 1440x2560` and `wm density 480`, giving 480×853 dp: the same
height as the approved 1280×2560 set with a slightly wider viewport. It also
selects a timezone where the local hour is 08–11 to match the 09:41 demo clock,
then sets demo mode (full battery and Wi-Fi), the local mock and screenshot
seed. On exit it restores the prior display overrides, demo-mode setting,
timezone, automatic-timezone setting and spell-checker setting, removes the
mock app and probe, and stops the mock and Gradle. Shut down the emulator when
finished. Never use a connected physical device.

### Closed testing

For personal Play developer accounts created after 2023-11-13, Google requires
at least **12 testers opted in continuously for 14 days** before applying for
production access. Closed testing starts after app setup; internal testing does
not count ([testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)).

1. Create a Google Group for testers. In Play Console → Test and release →
   Testing → Closed testing → Manage track → Testers, select **Google Groups**,
   enter its group email, and set a feedback email or URL.
2. Publish the closed-track release and copy its opt-in link. Invite at least
   12 members to the Group, then send them the opt-in link. Each tester must
   join the Group **and** opt in with a Google account; an invitation or install
   alone does not start their 14-day clock. The link appears only when the app
   status is Published, and may take hours to appear.
3. Keep 12 or more opted in continuously for 14 days. Ask them to use the
   prayer, voice, Scripture, journal, reminders and report flow, and collect
   dated feedback, device coverage, defects and fixes. Do not remove them
   early.
4. Dashboard → **Apply for production** after the criterion is met. Prepare
   answers on recruitment difficulty, tester engagement and real usage,
   feedback and collection method, app audience and value, estimated first-year
   installs, changes made from feedback, and why the app is ready. Google
   reviews the application before production access.

Sources checked 2026-10-12:
[Set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334)
and [personal-account testing / production access](https://support.google.com/googleplay/android-developer/answer/14151465).

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
EAS assigns the key to `app.lampada`, so `eas.json` has no
`serviceAccountKeyPath`.
