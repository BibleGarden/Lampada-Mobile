# Lampada test plan

- Purpose: a versioned catalogue of scenarios; execution statuses live in ClickUp
- Product: Expo SDK 57 / React Native, iOS and Android
- Main platform of the first run: iOS, a custom Release build

## Sources of truth

- the root task in ClickUp - the stages, the assignees, the execution statuses
  and the defects;
- this test plan - the stable scenario IDs and the expected results;
- `reports/` - the dated results of particular runs;
- `evidence/` - the selected proof the reports refer to.

The current statuses of the scenarios are not kept in this file.

## Testing stages

| # | Stage |
|---:|---|
| 01 | Smoke |
| 02 | Technical risks |
| 03 | Navigation, setup and the timer |
| 04 | Answers and audio |
| 05 | AI, network and privacy |
| 06 | Scripture, finishing and the journal |
| 07 | Devices and accessibility |
| 08 | Reliability and performance |
| 09 | Automation |
| 10 | Regression and release readiness |
| 99 | Postponed and accepted defects |

## 1. Goal

Verify that a user can go through a full prayer cycle without losing data:

1. open the app;
2. choose a goal and a duration;
3. start the prayer by holding the button;
4. answer with text and voice, read and save scripture passages;
5. finish the prayer and save the takeaway;
6. find the result in the journal after restarting the app.

Additionally verify robustness when the microphone, the network or the AI fails,
the correctness of local storage and the absence of any unexpected sending of
user data.

## 2. Out of scope for the first run

- the theological quality of the AI wording is assessed separately by a human;
- load testing of the server-side AI proxy;
- publishing and updating through the App Store / Google Play;
- exhaustive verification of every iOS and Android version.

## 3. Main risks

| Priority | Risk | What is checked |
|---|---|---|
| P0 | Loss of an answer or a recording | saving on closing the sheet, on the timer running out and on a restart |
| P0 | A crash or a dead end in the main flow | the transitions `setup → threshold → session → reflect → done` |
| P0 | A privacy violation | the answer-sharing setting, the body of the AI request, the locality of the audio |
| P1 | Native module errors | Skia, Reanimated, Gesture Handler, SQLite and Expo Audio in a custom build |
| P1 | Timer errors | background/foreground, changing the time, automatic and early finishing |
| P1 | Journal corruption | search, details, playback and cascading deletion |
| P1 | AI unavailability | no configuration, a timeout, an HTTP error, an empty response |
| P2 | Calendar errors | the streak, finishing twice in one day, the day boundary and the time zone |
| P2 | Interface problems | a small screen, iPad, the keyboard, the safe area, long texts |

## 4. Environments

### Mandatory for the first run

| Environment | Purpose |
|---|---|
| A custom iOS Release build on a physical iPhone | the main user run, the microphone, sound, haptics, persistence after a restart |
| The iOS Simulator | quick repeated checks of screens, navigation and sizes |
| Source code checks | TypeScript and the Expo SDK compatibility diagnostics |

### The next stage

| Environment | Purpose |
|---|---|
| The Android emulator and a physical device | the system back button, permissions, recording and playback |
| iPad / the iPad simulator | `supportsTablet`, the portrait layout, the width and the scaling |
| Web | a smoke check only, if web is a supported platform of the product |

For every report the device model, the OS version, the commit, the build type,
the presence of an AI configuration and the state of the database before the run
are recorded.

## 5. Test data sets

- a clean installation with no records and no settings;
- an installation with one finished prayer;
- a history of 20+ prayers with similar Russian goals;
- an empty, a short and a very long goal, Cyrillic, emoji and line breaks;
- a prayer without a timer, one of 5 minutes and one with the timer changed
  mid-way;
- answers: empty, whitespace only, a long text, several audio recordings;
- the AI disabled, working, answering slowly and returning an error;
- the microphone permission granted, denied and previously forbidden in the OS
  settings.

## 6. Checks before launching the app

| ID | Check | Expected result |
|---|---|---|
| PRE-001 | Install the dependencies from the lock file | the installation completes without an error |
| PRE-002 | Run `npm run typecheck` | exit code 0, the full log is stored in the report |
| PRE-003 | Run `npx expo-doctor` | no unexplained SDK 57 incompatibilities |
| PRE-004 | Build the app the supported way | the Release build installs and launches |
| PRE-004A | Build Android test Release against an HTTP API; inspect the generated manifest and open its catalog | test builds allow HTTP and load the catalog; HTTPS builds disable cleartext, and store builds reject an HTTP origin |
| PRE-004B | Run the shared Android runner (individual flow and critical tier) against store, old and wrong-API APKs with a valid local test configuration | all are rejected before Maestro, app launch or data clearing; installed test-channel/API metadata must match the expected test environment; temporary APK copies are removed on rejection |
| PRE-004C | Run Android preflight with missing runtime variables | exit nonzero, with the output directory and missing names visible in the console; no scenarios start |
| PRE-004D | Prebuild or build an Android store Release and inspect the merged manifest | `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are absent; the declared permissions match the Play Console declarations |
| PRE-004E | Check the application ids in `app.json`, Android flows and Android scripts; prebuild Android and inspect `applicationId`, `namespace` and the merged manifest | Android uses `app.lampada`, iOS keeps `twinkler`; no file under `app/`, `components/`, `lib/`, `modules/`, `plugins/`, `scripts/` or `testing/android-e2e/` references `com.nf404.twinkler` (`androidAppId.test.mjs`) |
| PRE-005 | Compare `expo.version` with the About footer after a local or preview build and after a production build | a test build shows the next patch of the current store version (`1.1` → `1.1.1`); a production build in TestFlight shows two components with the next minor (`1.1.1` → `1.2`); the update check treats `1.2` and `1.2.0` as equal |
| PRE-005A | Run `build-production.sh` without a platform, with `all`, with `all --keep-version`, and with `android --keep-version` before and after a test build | without a platform, and with `all --keep-version`, it stops before checks and bumps; `all` reserves one minor for both stores; `--keep-version` keeps a two-part version and refuses a test version such as `1.4.1` (`buildVersion.test.mjs`) |

Expo Go is not to be used: it lacks some of the native modules of the project.

## 7. Smoke scenario

The smoke counts as passed only in full.

The `[critical]` / `[main]` / `[rare]` suffix on a scenario ID is the
e2e tier of the Maestro flow that covers it (the `tags:` of the files
in `testing/e2e/`): `critical` runs on every build, `main` before every
release, `rare` on demand or before a major release. `ipad` marks the
iPad-only rotation flows run by `npm run test:e2e:ipad`. An ID without a
suffix has no standard tier flow; it may run in a prepared stub phase or be
checked manually. The `prepared` tag marks flows needing setup and excludes them
from `npm run test:e2e:all`; the self-contained ordered suites (lock, lock-006,
journal, background) carry no tag and run there. An ID can list both `main`
and `ipad` when separate phone and tablet flows cover it.

| ID | Actions | Expected result |
|---|---|---|
| SMK-001 [critical] | A cold start | the home screen appears without freezing or errors |
| SMK-002 [critical] | Open the prayer setup, set a goal and 5 minutes | the values are displayed and lead to the threshold screen |
| SMK-003 [critical] | Release the hold too early, then hold it fully | the first gesture is cancelled, the second starts exactly one session |
| SMK-004 [critical] | Open the answer, save the text | the answer is marked as saved and is not lost |
| SMK-005 [critical] | Finish early, save the takeaway | Home opens directly with a lit flame and a temporary saved notice |
| SMK-006 [critical] | Go back Home and open the journal | the prayer, the answer and the takeaway are there |
| SMK-007 [critical] | Force-quit and open the app again | the saved data and the streak remain |

## 8. Functional scenarios

The tier suffixes on the IDs are described in section 7. If flows of
different tiers cover one scenario, the suffix marks the most frequent
tier of its e2e runs.

### Home screen and navigation

| ID | Scenario | Expected result |
|---|---|---|
| NAV-001 | The first launch with a clean database | a correct greeting, an empty week, the journal, the settings and the start available |
| NAV-002 [critical] | Double-tap Start on Home, then return after an unfinished setup on iOS and Android | one Back press returns Home; no duplicate setup route remains, the draft session is reset, and the app does not hang |
| NAV-003 [main] | Opening screens by a deep link with no navigation history | the back button leads Home or closes the screen safely |
| NAV-004 | Android Back during the prayer and the reflection | the system gesture does not break the mandatory flow |
| NAV-005 | Fast repeated presses on the transitions | no duplicate screens or sessions are created; the second Home tap cannot activate Next during Setup entrance |
| NAV-006 | Leave Home in the background after praying, then reopen the app on a later day without navigating | the last dot represents the current local day, yesterday's prayer moves left, and the flame and greeting refresh |
| NAV-007 | Keep Home open across local midnight, including a daylight-saving transition | the calendar advances at local midnight; today's unprayed dot becomes an outline and the previous prayer remains on its actual date |
| NAV-008 [ipad] | Rotate an iPad between portrait and landscape on Home and another screen, including while JavaScript is briefly busy | the background covers the entire canvas during and after rotation; no strip retains the previous width or height |
| NAV-009 | Cold start of a Release build on Android 12+ and on iOS | the launch screen is the app background `#0e0a07` with the flame centred, with no white screen, placeholder grid or visible square around the flame; the flame does not jump or blink when the native splash hands over to the app, and it stays until Home is drawn, with no empty dark frame between them. On Android, repeated cold starts after `pm clear`, also with the host CPU loaded, log no `Activity transferring splash screen timeout` under normal and moderate load, and `dumpsys window` shows no `starting_reveal` animation leash afterwards. Known residual risk (ADR-0040): under extreme host CPU load on the emulator one cold launch in 13 timed out the hand-over, leaving a `starting_reveal` animation that slows Maestro input; report such a launch with the load level, not as an app defect |
| NAV-010 | Update check on iOS and Android against a server returning soft and hard decisions, then against a server without `platform` | the request carries `platform=ios` or `platform=android`; a decision for the other platform or without `platform` shows no overlay and appends a `version_check_ignored` record with `platform-mismatch` to `lampada-diagnostics.log` (request and acceptance: `versionCheck.test.mjs`); manually, on Android Update opens the Google Play listing and never the App Store |
| NAV-011 | Finish a prayer and return Home on a short window: a Galaxy Z Fold inner display in portrait and landscape (an Android emulator at `wm size 1812x2176`, density 420), iPad Split View and an iPhone SE | the saved notice, the streak line, the dots and the title do not overlap each other or Start; where the window has room the flame keeps its usual size, on a short one it is smaller with the same proportions (unit tests in `flameGeometry.test.mjs`) |

### Setup and entering the prayer

| ID | Scenario | Expected result |
|---|---|---|
| SETUP-001 [critical] | Leave the goal empty | free prayer is available, the texts contain no empty or broken phrases |
| SETUP-002 [critical] | Pick each goal example | the modal closes, the chosen text appears in the field |
| SETUP-003 [critical] | Check the 5/15/30/60/∞ presets and the ± buttons | the value and the declension of the minutes are correct, the bounds are safe |
| SETUP-004 [main, ipad] | Edit a long goal on iPhone and iPad; on iPad rotate while typing, then tap above the field and in both side margins | the form reflows into the available viewport when the keyboard opens or rotates, and long text scrolls without covering the actions or losing focus; duration and "Next" are hidden while typing; taps inside keep editing, outside taps or "Done" restore the actions in place, without a top-left motion or lost text |
| SETUP-004b [prepared, android] | On Samsung, select the floating keyboard, edit the goal, switch to the standard keyboard and back; repeat folded and unfolded, then request rotation | a floating keyboard retains the normal field size; duration and Next stay hidden with either keyboard mode and return only after closing it; the standard keyboard expands the input only to its top edge; switching modes and closing the keyboard preserve the text; Android keeps its configured portrait orientation; `android-setup-floating-keyboard.yaml` checks the floating layout |
| START-001 [critical] | A short hold and moving the finger outside | the progress resets, no session is created |
| START-002 [critical] | A full hold | exactly one session is created and the timer opens |
| START-003 | Repeated gestures during the transition | no parallel sessions are created |
| START-004 | A SQLite error while creating the session | the button does not stay blocked forever, the error is diagnosable |
| START-005 [ipad] | Open the threshold on an iPad with a multi-line goal and rotate between portrait and landscape | landscape shows the briefing and hold-to-start button side by side; all three briefing items fit for a typical multi-line goal; longer content scrolls without covering the button; portrait returns to the vertical layout |
| START-006 | Open the threshold with a two-line goal and undecided answer consent on a short window: a Galaxy Z Fold inner display in portrait with a taskbar or three-button navigation (an Android emulator at `wm size 1812x2176`, density 420), an iPhone SE, iPad Split View | all three briefing items are fully visible above Start, no line is cut; a window with room keeps the original spacing and button size; on a window too short even for the densest layout the briefing scrolls and its edge fades instead of cutting a line (unit tests in `thresholdLayout.test.mjs`) |

### The timer and the prayer flow

| ID | Scenario | Expected result |
|---|---|---|
| SES-001 [critical] | A finite timer | it decreases to zero, waits for the reader, answer and narration, then opens reflection after one second on the unobstructed prayer screen |
| SES-002 [main] | The ∞ mode | the elapsed time is displayed, there is no automatic finish |
| SES-003 | Change the timer with the − / + buttons | the time changes by the expected step and never becomes invalid |
| SES-004 | Background the app and come back after 10-60 seconds | the timer behaviour matches the chosen product policy; any divergence is recorded |
| SES-005 | Finish early | an open answer is saved, then the reflection opens once |
| SES-006 | Choose "Back to prayer" on the reflection | a new countdown starts with the same goal, without losing the already saved answers |
| SES-007 | A very long goal | the text does not overlap the timer and the companion panel |
| SES-008 [ipad] | Inspect the Question / Quote switcher on an iPad | both icons scale with their labels and stay aligned in the two tabs; inspect the landscape screenshot in the ANS-033 flow |
| SES-009 | Move Home → Setup → Session → Reflection → Home, open and close the answer and recordings sheets, then background and foreground the app | only the exposed flame, halo, music pulse and recording wave animate; hidden screens and closed sheets have no visual loop or UI polling; animations resume when exposed, the timer catches up and background music retains its deadline fade. Energy measurement in Instruments is separate |
| SES-010 [android] | In the system light mode, open the prayer screen with 3-button and with gesture navigation; switch Question / Quote several times | the navigation bar is transparent over the dark app with light buttons, without a white scrim; the companion card's buttons and step dots stay inside the card frame, and the frame keeps a margin above the navigation bar. A visual check with screenshots: Maestro does not assert colors or frame overlap |

### Background music

| ID | Scenario | Expected result |
|---|---|---|
| MUS-001 [main] | Turn the music on and off with the button in the session | the button and the indicator change state, playback starts and stops |
| MUS-002 | Launch the app with no network and turn the music on | the bundled pieces are fully available offline |
| MUS-003 | Wait for the end of the playlist | fifteen tracks play in sequence and the loop starts again |
| MUS-004 | Background the app with the music on and come back | in the background the music is paused and resumes after the return if the state was on |
| MUS-005 | With the music on, record a voice answer and listen to the draft | the music stops before the recording or the playback begins and resumes afterwards; it is not present in the voice recording |
| MUS-006 [main] | Finish a timed prayer early or after timer expiry with music on | the music player stops and does not play on reflection or the next session screens (`ios-music-finish-early.yaml` covers early finish) |
| MUS-007 [main] | Let the timer reach zero with music on and no open reader, answer or narration | reflection opens after one second and both music players stop without a released-player crash |
| MUS-008 | Start several prayers in a row | the starting track is chosen at random and does not repeat the start of the previous session within the current app launch |
| MUS-009 | With the music on, send the app to the background or lock the screen before the timer reaches zero | the music stops at the deadline in the background; reflection opens after returning (`run-background-music-timer-end.sh`) |
| MUS-010 [main] | Start an untimed prayer, play music, then finish it explicitly | music fades out before reflection opens, its audio session is released, and playback does not restart (`ios-music-finish-untimed.yaml`) |
| MUS-011 | With music never enabled, play and stop scripture narration, play and pause a voice draft, then finish a microphone recording | each action releases the audio session after it stops; on a physical iPad, the app becomes suspended in the background after the last sound; verify with Instruments or the system process report |

### Answers and audio

| ID | Scenario | Expected result |
|---|---|---|
| ANS-001 [critical] | Save a text, open the same question again | the saved text is restored |
| ANS-002 | Close an empty sheet | it closes without an extra confirmation |
| ANS-003 [main] | Close an unsaved non-empty answer | an explicit second confirmation is required, the data is not lost silently |
| ANS-004 | Deny access to the microphone | the app does not crash and stays usable |
| ANS-005 [main] | Record and stop one audio; play, pause, resume and replay after completion | a recording with a non-zero duration appears; pause keeps the progress and elapsed time; Play resumes from that position; replay after completion starts from zero |
| ANS-006 [main] | Create several recordings and switch playback between them | the files differ, earlier recordings are not overwritten; switching starts the selected recording from zero and resets the previous row's progress |
| ANS-007 | Save while a recording is active | the recording is stopped and saved correctly |
| ANS-008 [main] | Delete a recording with a confirmation | the recording disappears from the UI, the database and the files after saving |
| ANS-009 | Try to close the recordings sheet by a swipe or by the background during a recording | the sheet does not close; the microphone stays under visible control until "Done"; after stopping the sheet closes the usual way |
| ANS-010 | The timer runs out with the sheet open | the whole non-interactive notice box fades and moves into place above the sheet together with its text; text and recording continue; successful save/close and recording cleanup are followed by reflection after one second |
| ANS-011 | Switch between questions and edit an old answer | the answer is saved under the correct question |
| ANS-012 | Stop a recording and do not press "Transcribe" | the audio recording and the button appear; no network request is made and no tokens are spent |
| ANS-013 | Press "Transcribe", then save while the request is in flight | a loading state appears, after 4 s a hint that the window can be closed; the save waits for the request, the audio and the text are restored after reopening |
| ANS-014 | Get HTTP 413, 429, 5xx, a timeout, or a disconnected network during transcription | each cause has its own plain-language message; the audio stays available, "Retry" is shown, and a repeated attempt can succeed; each failure appends a `transcription_failed` record with the category, the HTTP status when there is one and the error class to `lampada-diagnostics.log` (unit: `transcriptionErrors.test.mjs`, `transcriptionRuntime.test.mjs`) |
| ANS-015 | Delete or cancel a recording during transcription | the request is cancelled, a late response does not bring the deleted recording back into the UI or the database |
| ANS-016 | Open a long transcript in the recordings sheet | the block shows three lines, "Show in full" expands and collapses it; the list of recordings stays scrollable |
| ANS-017 | Press "Add to the answer" on an empty and on a filled answer | the recordings sheet closes, the transcript text is appended to the end of the answer field after a blank line, the transcript itself does not change |
| ANS-018 | Inspect a generated transcript and save the answer | the transcript offers expand/collapse and "Add to the answer", with no separate deletion action; the transcript and audio remain available after reopening |
| ANS-019 [main] | On an empty answer, quickly press the microphone / "Record" again while it is starting | exactly one recorder start happens, the buttons and closing are unavailable until the pending state ends, there is no hidden recording |
| ANS-020 | Quickly press "Done" twice while a recording is stopping | exactly one stop happens, one working recording appears, a successful file is not deleted and no save error is shown |
| ANS-021 [main] | With the music on, save an audio in one question, move to the next one and record a second immediately | both recordings are saved and play back; a late restoration of the music does not cut the second file and the "The recording was not saved" message does not appear |
| ANS-022 [main] | Press "Record another" twice quickly without moving the finger | the second tap does not land on the "Done" button that appeared; the UI stop is unavailable for the first 1.5 seconds, the recording continues, and a file shorter than 0.5 seconds is not added to the list |
| ANS-023 [main] | Open the recordings and start a recording on an iPhone SE / Home Button, an iPhone with a Home Indicator, an iPad and Android with 3-button navigation; close the recordings with the keyboard hidden | "Record another" and "Done" are fully visible, the bottom frame is not clipped and a margin remains between the button and the screen edge; the open answer and recordings sheets and their dimming reach the screen edge, and their footer actions sit above the Home Indicator / navigation bar (screenshots `ANS-023-recording-done`, `ANS-023-record-another`, `ANS-023-answer-sheet`); Save stays reachable above a docked keyboard, closes the sheet and the saved answer reopens (`ANS-023-saved-with-keyboard`, `ANS-023-reopened`). That the close slides fully off screen and the reopen starts from the screen edge is a manual check (`MANUAL_CHECKS.md`, ANS-023) |
| ANS-024 [main] | On iOS and Android, type an answer with an existing voice recording, open recordings, close them, and focus the answer again | the keyboard closes when recordings open, the list and bottom button are reachable; closing recordings retains the text and restores editing; Android flow: `android-ans-024-recordings-keyboard.yaml` |
| ANS-025 | With VoiceOver, check a short and a long transcript | the text is read out in full; a short text is not announced as a button; for a long text "Show in full"/"Collapse" is a separate focusable button |
| ANS-026 | During a recording, simulate an interruption or a media services reset as far as the device allows | the false recording overlay disappears, the audio focus is released and the next recording starts normally |
| ANS-027 | On physical iOS, record quiet speech and pauses of at least 4 seconds | a valid M4A is saved regardless of the actual AAC bitrate, and the recording is fully audible on playback |
| ANS-028 [main] | On physical iOS, create two recordings with different spoken markers in different questions, save and reopen | both recordings belong to their own questions, are not overwritten and play the correct marker after reopening |
| ANS-029 | On physical iOS, perform 10 cycles of start → stop → play without restarting the app | every cycle creates one new valid M4A; there is no save error, no stuck overlay and no unavailable next start |
| ANS-030 | On physical iOS, start a recording right after pausing or finishing a draft or the scripture narration | the deferred deactivation of the player does not cut the recorder; the M4A duration matches the speech and playback does not jump to the end |
| ANS-031 | On physical iOS, record two different files in a row and play the second, the first and the second in turn | every replace waits for its own AVPlayerItem to load, starts from zero and plays the correct file in full |
| ANS-032 [main] | Let the answer sheet settle, open recordings, play and pause, then close recordings with the chevron; repeat after opening and closing the keyboard | the answer field and actions remain visible and usable; tapping the question or handle closes the keyboard without losing the draft; closing the answer removes the backdrop; no stale closed position or dark blocked screen appears |
| ANS-033 [ipad] | Open a multi-line question on a landscape iPad, focus the answer, type and rotate to portrait and back | the question and form use separate columns in landscape; the field remains tall enough for multiple lines above the keyboard; actions stay visible; rotation preserves the text and restores the portrait layout |
| ANS-034 | With the session timer running, open the answer sheet and type a sentence of about 50 characters at a steady pace | every keystroke appears in the field without batching or visible stalls (measured: one update per keystroke, no gap above 150 ms); the halo behind the timer stops breathing while the sheet is open and resumes after it closes |
| ANS-035 | Start a voice draft, close the recordings sheet while it loads, then play a different draft | the cancelled draft never starts, its audio session is released, and a late completion or error cannot stop the new draft |
| ANS-036 | On a device, record until the 10-minute limit | the normal elapsed clock becomes a highlighted countdown at 8:59, reaches zero at 9:59 recorded time and stops the recorder once; a quiet cue mixes with other apps' audio, light haptics play, and the file-backed draft can be played and transcribed |
| ANS-037 | Record a short new voice note, then play and transcribe it and a pre-existing 44.1 kHz stereo note | the new M4A is mono AAC at 22.05 kHz and 48 kbit/s; both notes remain playable and transcribable |
| ANS-038 | Try to transcribe an older file one byte above 14 MiB or longer than 600 seconds | the upload does not start, a plain-language length message appears, and the audio remains playable |
| ANS-039 | Transcribe an existing manually stopped 9:59 recording | the client reads its file duration, accepts a value below the server limit, and uploads without a length warning |
| ANS-040 | Suspend the app during a recording and return before the limit | Expo pauses the native recorder in the background; after return the same recorded-time counter resumes and the controller stops once at 9:59 accumulated recording time, without pausing or restarting the recorder itself |
| ANS-041 | Fail the file-duration reader after a successful native stop | the URI stays attached to a visible, playable draft marked with unknown duration; an error is logged, saving retains the recording, and transcription measures the file again |
| ANS-042 | Close the recordings sheet while the automatic stop is finalizing or its cue is playing | the draft is retained, no late cue plays over resumed music, and the cue player and audio-session lease are released |
| ANS-043 | Make the native stop or duration status fail repeatedly at the limit | automatic work attempts to stop once, an explicit error appears on the recording overlay and in the log, the Done control remains available, and no 250 ms retry loop runs |
| ANS-044 | Tap the stop control within 1.5 seconds of starting, then keep recording until the limit | the early tap is ignored without an error, the duration limit remains active, and the recording stops normally at 9:59 recorded time |
| ANS-045 | Make an attempted manual stop fail while the native recorder continues | the error is shown, the limit remains active, and a later limit stop still runs at 9:59 recorded time |
| ANS-046 | Play a finished file with a fractional duration, such as 39.3 seconds | its card shows the nearest whole second (0:39 in this example); upload validation still compares the exact fractional file duration |
| ANS-047 | Leave the session while the recording-limit cue is pending or playing | the answer sheet unmounts without calling an already released native player or recorder; cue listeners and audio-session leases are released and the app does not crash |
| ANS-048 | On Android, type an answer and switch the input method to another one and back within a fraction of a second (Maestro's `inputText` does this in `android-stage04-answers-text.yaml`), including an input method taller than the sheet | the answer field keeps focus and the typed text, the sheet ends at full height above the docked keyboard, and Save, Cancel and the microphone stay in the accessibility tree; when the input method ends hidden, no keyboard space stays reserved under the footer or in journal and preparation forms; the snap policy, the reservation and the footer position are unit-tested in `keyboardGeometry.test.mjs` |
| ANS-049 | Open the recordings sheet from an answer, then start a recording | the question and its "Question for reflection" label stay at the top of the recordings sheet, above the list and above the recording overlay; while recording, the whole sheet, the question and the actions share the overlay background with no inner card corners or side strips, the overlay hint ends above the actions, and "Done" is the standard gold primary button with a centred label ("Saving…" while stopping) |
| ANS-050 | With a docked software keyboard, focus the answer field and then tap the question to hide the keyboard; repeat on an iPad (ProMotion) and an iPhone | the sheet rises with the keyboard and returns to the resting snap together with it, in one continuous motion: the return starts at the keyboard hide, not after it has finished; the actions move above the keyboard frame by frame and the field never shows through them; the field takes its final height when a transition starts and does not change when it ends, also when the sheet opens (`keyboardShowing` and `sheetBodyHeight` in `keyboardGeometry.test.mjs`). Smoothness on a physical device is a manual check (`MANUAL_CHECKS.md`, ANS-050) |
| ANS-051 | On Android, transcribe a new recording with speech | the transcript appears; the upload declares the file part as `audio/mp4`, so Bible API does not answer 415 (unit: `transcriptionRuntime.test.mjs` with the Android `audio/mpeg` file type) |
| ANS-052 | Record three answers, one with a long transcript, open the recordings sheet and scroll to the end on a phone, a Galaxy Fold inner display (1812×2176, 420 dpi), an iPhone SE and an iPad | the question and the recordings header stay at the top; the list scrolls between the header and "Record another", and the last card ends fully visible above the actions, never under them |
| ANS-053 | On Android, play a draft recording while the native player ignores `play()` (audio session disabled) | the draft does not stay shown as playing: within two seconds the sheet shows "Could not play the recording" and a `recording_playback_failed` record with `place: answer` and `reason: not_started` is appended (unit: `nativePlaybackStart.test.mjs`) |

### The AI and the companion

| ID | Scenario | Expected result |
|---|---|---|
| AI-001 | The AI variables are missing | the local questions are used, the main flow works |
| AI-002 [main] | Successful AI responses | the questions are not empty, the transitions are not blocked |
| AI-003 [main] | A timeout, offline, HTTP 4xx/5xx and invalid JSON | there is a safe fallback, it is visibly labelled as a backup question, and there is no endless loading or unhandled rejection |
| AI-004 | Finish or reset the session quickly while a request is unfinished | a late response does not change the new session |
| AI-005 | Core AI consent is undecided or denied | questions use the local pool; scripture sends neither `topic` nor `user_replies` |
| AI-006 [main] | Allow core AI and save the first non-empty answer | a separate disclosure explains that answers and transcripts go to Google Gemini through Google's paid API so later questions and Scripture reflect them; our server does not store them; both choices have equal weight |
| AI-007 [main] | Set different values for the three AI purposes, close the privacy sheet with its cross, and restart the app | each choice applies immediately and is restored independently from its versioned SQLite record; the sheet has no Done button; settings explain each transfer in plain language and the threshold says answers stay on the device and leave our server no stored copy |
| AI-008 | Slow the AI down and check the entry and several rotations | a ready question appears without a loader; a pending request waits for its own result without a second request and without a premature fallback; the refill starts after the display |
| AI-009 | Finish the prayer with a fast, a slow and an unavailable AI | the closing question is prepared 15 seconds before zero; a ready one is shown immediately, a pending one shows a loader without an intermediate fallback; changing the answer in the last 15 seconds updates the prefetch; a real fallback is explicitly marked as such |
| AI-010 [critical] | On a fresh or upgraded installation, start the first prayer | the core disclosure says the prayer topic goes to Google Gemini through Google's paid API for questions and Scripture passages; our server does not store the topic; it appears before any content request |
| AI-011 [main] | Press "Transcribe" for the first time, deny it and retry | the disclosure names both possible processors for turning the recording into text: Whisper on our servers or Google Gemini through Google's paid API; we do not store the recording; no upload starts and the recording stays usable |
| AI-012 | Withdraw each allowed decision in settings immediately before its feature | the next question/scripture request or upload observes the denial without restarting the app |
| AI-013 [main] | Upgrade with each of the three decisions stored under notice version 2 and `company-hosted-ai-2026-09` | every old decision resolves to `undecided`; no content is sent until a decision under notice version 3 and `google-gemini-paid-whisper-self-hosted-2026-09` is saved |
| AI-014 [main] | Save a voice-only answer without transcribing it, then request another question | the next visible question differs from every previously shown question while an unused local question exists; a repeated server response marked `novel: true` is rejected, using the local pool after an answer |
| AI-015 | Replace an unanswered question after a prior replacement, with the server returning an earlier question with changed case, spacing or trailing punctuation | the current question remains visible; one explicit tap can request another replacement, with no automatic retry loop |
| AI-016 | Exhaust the next or reflection local pool, then request another question or continue prayer and finish again | an unseen local question always wins; only after the pool is exhausted can a question repeat, and the least recently shown one is chosen; a previous reflection question counts as shown |
| AI-017 | Save a voice-only answer without transcription, then request the next and reflection questions | each request includes the answered question in `shown_questions` without a transcript or reply in `messages`; the first-stage request has no `shown_questions` (unit: `questionContext.test.mjs`) |
| AI-018 | Allow core AI, deny answer-context sharing, answer several questions, and request the next and reflection questions with a topic whose language is unclear | requests keep `messages` empty, include the answered questions in `shown_questions` and send the interface language as `default_language`; no human answer leaves the device (unit: `questionContext.test.mjs`, `questionSession.test.mjs`) |
| AI-019 | Navigate through earlier questions while the next question is prepared | the prepared question is used when advancing from the frontier; navigation alone does not start another request |
| AI-020 | Saving a privacy decision fails, in the first-use dialog and in Settings | the dialog stays open with "Could not save the decision. Please try again."; in Settings the choice returns to the stored one with the same message; a `consent_save_failed` record with the purpose is appended (unit: `scriptureInitialization.test.mjs`) |

### Scripture

| ID | Scenario | Expected result |
|---|---|---|
| SCR-001 | Get the first server passage and move on | the first request shows loading, the next passage comes from the prefetch and differs |
| SCR-002 | Go back and forward again | the actual trail is shown, with no new network requests and no change to the exclusions |
| SCR-003 | Add and remove a favourite | the canonical snapshot changes immediately and survives a restart |
| SCR-004 | Open a long passage with a nullable title | the paragraphs are preserved, a missing title does not break the reader |
| SCR-005 | Turn "Use my answers" off and go through the dialogue | `user_replies` is absent from the serialized scripture request |
| SCR-006 | Get a `safe_pool` or a `retrieval_fallback` | the passage is displayed as an ordinary success, with no technical message |
| SCR-007 | 403, 422, 429, 503 and a timeout | no crash and no endless retry; the technical `detail` is not shown |
| SCR-008 [main] | Choose a language, a translation and a narration, save and restart the app | the complete triple is restored, a new session sends the chosen `language` and `translation` |
| SCR-009 | Change the language, then the translation | the child lists are cleared; an incompatible or incomplete triple cannot be saved |
| SCR-010 [rare] | Open the settings with no network or with a catalogue error | the saved labels are visible, a retry is visible and reachable next to wrapped error text, the previously saved choice is not damaged |
| SCR-011 | Switch the language or the translation once an offline cache exists | the offline fallback does not show a snapshot of another language or translation |
| SCR-012 | A clean installation with a supported interface language, including one different from the primary device locale | the interface language and a confirmed valid translation/voice triple are chosen |
| SCR-013 [prepared] | A clean installation offline (catalog fails): open Settings, start a prayer and open the scripture block; restore the catalog and press Retry; relaunch with the catalog failing again | Settings show no Bible choice and the catalog error; the prayer starts without waiting; the scripture block shows "Bible catalog unavailable" with Retry and no passage; nothing is written to `meta.scripture_preferences`; Retry confirms the interface-language triple and shows a passage in the same session; the saved choice survives the later catalog failure and an interface-language change (unit: `scriptureInitialization.test.mjs`, `sessionResume.test.mjs`; flows: `*-scripture-catalog-{failure,recovery,saved-offline}`, `android-scripture-catalog-reopen`) |
| SCR-014 [main] | Change the device language after the setting was saved | the saved user choice is not overridden |
| SCR-015 [rare] | Pause the scripture narration, press resume and immediately switch the mode or the passage | the old passage does not resume after the context changes; the new passage starts normally |
| SCR-016 | Let the timer expire during scripture narration with music enabled | the passage plays to its end; an open reader still postpones completion; once reading and narration finish, reflection opens after one second |
| SCR-017 | Read silently in the expanded reader when time expires; continue scrolling, then close the reader | the notice does not intercept touches or close the passage; closing the reader returns to the timer, then reflection opens after one second |
| SCR-018 | Reopen the reader, pause/resume narration, open an answer or add time during the one-second delay | the pending transition is cancelled; open activities remain visible; a narration error stays on the card but does not hold the expired prayer, so reflection opens after one second; extra time resets expiry; completion runs once |
| SCR-019 | Compare a compact quote with the full passage in the reader, favourites and journal | key verses retain the card's off-white colour; surrounding verses use the same colour at 55% opacity; narration uses a translucent white underline; passages without key verses remain at full opacity |
| SCR-020 | A launch and navigation with no network | at most seven recently shown compatible passages are available; with an empty cache there is a neutral error and a retry |
| SCR-021 | Recover the network while an offline passage is visible and press its retry label | a fresh server passage replaces the offline frontier without walking to the end of the saved history |
| SCR-022 | A response with a canonical Psalm 23 and a translated Psalm 22 | the reference is built as "Psalm 22", from `passage` |
| SCR-023 | A response with `history_reset: true` | the exclusions are reset, the current ID is added again, the trail and the favourites are preserved |
| SCR-024 | A text shorter than 160 characters wraps onto more than three lines; then a short passage that fits the card | the long one shows the continuation mark (`scripture-read-full`) and a tap opens the whole passage; a tap on the short one (`scripture-preview`) also opens the reader |
| SCR-025 [main] | Expand the reader as far as possible with a long passage on an iPhone with a Dynamic Island | the top of the reader stays below the status bar; the title and the buttons are not overlapped |
| SCR-026 | Start narration, cover the session with the PIN screen or background the app, then return | narration continues from its current position without restarting; the session timer expires on schedule, but reflection waits until the prayer screen is visible |
| SCR-027 [prepared] | A clean installation whose catalog has no narrated translation for the interface language (stub `catalog=unvoiced-ru`, Russian system language): start a prayer, open the scripture block, follow its action to Settings, pick English / BSB / Bob Souer, return | the block says there is no Bible for the interface language and offers "Open settings" instead of a retry; Settings show the Bible language list with "No Bible matches the interface language"; the manual triple is saved (`en/16/151` in SQLite) and the block shows a passage in the same session; manual checks: a failed save of the pick is shown; a storage failure shows `scripture-storage-error`; a reminder tap while Settings are open from the prayer keeps the prayer; switching the interface to English on the same Settings screen rechecks the catalog and replaces the message with the English default (unit: `scriptureInitialization.test.mjs`, `sessionResume.test.mjs`; flows: `*-scripture-catalog-no-default`) |
| SCR-028 | On Android, play the narration, pause it, resume it, let it finish and play it again; interrupt it with another app taking audio focus, then return; record a voice answer and play the narration once more; finish the prayer and play its recording in the journal | every start and journal playback is audible, narration resumes after audio focus returns, and a system pause does not hold an expired prayer; the label shows "Pause" only while the passage sounds; logcat has no `Audio has been disabled`; if the native player does not start within two seconds without buffering, the card shows the narration error and the expired prayer still opens reflection (unit: `audioModeCoordinator.test.mjs`, `audioPlayerOperation.test.mjs`, `scriptureAudioOperation.test.mjs`, `sessionCompletion.test.mjs`) |
| SCR-029 | The narration stream keeps buffering after Listen (a throttled or stalled network) | after 15 seconds of buffering without sound the card shows the narration error instead of "Pause"; a `scripture_audio_failed` record with `reason: buffering_timeout` is appended to `lampada-diagnostics.log`; every other narration failure also leaves a `scripture_audio_failed` record with its reason (unit: `nativePlaybackStart.test.mjs`) |
| SCR-030 | A local storage failure (SQLite) while the next passage is chosen, on entry and from the open block | the hidden entry attempt leaves the block idle; opening the block or Next shows "Could not select a passage right now." with "Try again" instead of an endless loading state; each failure appends `scripture_load_failed` (unit: `sessionResume.test.mjs`) |
| SCR-031 | Add or remove a favourite while the database write fails | the heart returns to the stored state unless it was toggled again; a `favorite_save_failed` record is appended (unit: `sessionResume.test.mjs`) |
| SCR-032 | Open Saved passages while reading the favourites fails | the screen says "Could not open saved passages. Tap to try again." instead of the empty-list text; a tap retries; a `favorites_load_failed` record is appended (manual, fault injection) |

### Content reports

A user-facing complaint about a generated question or a passage
(`lib/contentReportClient.ts`, `components/ContentReportDialog.tsx`).
The client and active-tab target have unit coverage in
`lib/__tests__/contentReportClient.test.mjs` and
`lib/__tests__/contentReportTarget.test.mjs`. Prepared Maestro flows
`ios-rpt-001-002.yaml` and `ios-rpt-003.yaml` cover sending and retrying with
the stub; execution results belong in dated reports.

| ID | Scenario | Expected result |
|---|---|---|
| RPT-001 | Open the report dialog from the companion dock for a generated question in Russian, Ukrainian and English; send without a comment | visual, checked manually on a device or simulator in each language: the send label is centered with inner padding and fits; one localized confirmation dialog appears; the request carries `content_type: "question"`, the question text, the interface language and no `user_comment`; a success state is shown; the request never contains the prayer topic or the answer |
| RPT-002 | Switch to Quote, open the card-corner report dialog, add a comment and send | the reader has no report button; the request carries `content_type: "scripture"`, the full passage reference, title when present, text, the trimmed comment and the interface language; the success state replaces the "Report this …?" title with "Report sent" and its body does not repeat the title, here and for the question report in RPT-001 |
| RPT-003 | Get a network, a timeout or a 5xx failure and retry | the dialog and the typed comment stay available, an error text is shown, a repeated attempt can succeed; the unsaved answer in the sheet is not mutated |
| RPT-004 | Look for a report action in the saved journal | there is none: the journal shows generated questions beside private answers, so reporting stays in the active session card |
| RPT-005 | Keep a Question or Quote report dialog open while the session timer expires; type a comment, then dismiss the dialog | the session and comment remain visible past expiry; after dismissal, reflection opens following the one-second delay |
| RPT-006 [main] | On iOS and Android, type a report comment, dismiss and reopen the keyboard, then send without closing the keyboard | the comment and Send/Cancel actions stay above the keyboard; a backdrop tap closes the keyboard and preserves the exact draft; Send reaches the success state, dismisses the keyboard and returns to the session |

### Reflection, finishing and the streak

| ID | Scenario | Expected result |
|---|---|---|
| END-001 [critical] | Finish without a takeaway | the session finishes and returns directly Home with a temporary saved notice |
| END-002 [critical] | Finish with a takeaway | Home opens with a temporary saved notice, checked immediately after finishing; the text remains in the journal |
| END-003 [main] | A double press on finishing | the finish and the day mark happen exactly once |
| END-004 [main] | Two prayers in one day | the day counts once, both meaningful sessions are in the journal |
| END-005 | Finishing around midnight and after a time zone change | the prayer counts for the local calendar day it started on; the streak and the seven dots agree with it (unit tests in `journalDays.test.mjs`) |
| END-007 | Leave an expired prayer overnight, open the app the next day and finish it on reflection | the prayer counts for the day it started, not the day of "Done"; the streak stays unbroken |
| END-006 [main, ipad] | Enter a takeaway with the keyboard open on iPhone and iPad; on iPad, rotate while typing | the input stays above the keyboard; the editing column and title retain their resting width and scale and long content is scrollable; the hidden actions do not glow through the keyboard; "Done" or a tap outside restores the finish and back actions without losing text |
| END-008 | Type a takeaway with a hardware keyboard in an App Store video build | while the input is focused, the visible flame stays on one frame and each non-whitespace character causes a visible text or caret update; after blur the flame animates again; ordinary builds never freeze the flame (`reflectionFlame.test.mjs`). The ANS-034 smoothness expectation is a 150 ms maximum visible gap, reported as a metric in the video pipeline; its gross recording rejection gate is 250 ms. |
| END-009 | Finish the prayer while the first question is still loading | the reflection question appears; the late first question does not leave reflection loading |
| END-010 | Pray for more than a minute without finishing, or save an answer, then force-quit the app (also from the app switcher) and open it again | the prayer is in the journal with the time prayed up to the last minute or the moment the app left the foreground, and Home marks the day it started; ADR-0042 (unit tests in `journalDays.test.mjs` and `sessionResume.test.mjs`) |
| END-011 | With a docked software keyboard, focus the reflection field and then tap outside it to hide the keyboard; repeat on an iPad (ProMotion) and an iPhone | the field fills the form at its final height from the start of the opening, and the keyboard rises into the empty strip below it; when the hide starts, the form returns to its normal layout at once and the field never stretches into the space the keyboard frees; the actions return at the same moment and move down above the keyboard, with no second change after it has gone (`keyboardFormPolicy` and `pendingKeyboardReserve` in `keyboardGeometry.test.mjs`). Smoothness on a physical device is a manual check (`MANUAL_CHECKS.md`, END-011) |

### The journal and local data

| ID | Scenario | Expected result |
|---|---|---|
| JRN-001 [critical] | An empty history | a clear empty state without an error |
| JRN-002 [main] | An abandoned empty session, left within the first minute without answers | it is not shown in the journal and Home does not mark its day |
| JRN-003 | Search by the goal, the takeaway, a question and an answer | the right records are found |
| JRN-004 | A Cyrillic search in a different case | the search stays case-insensitive |
| JRN-005 [main] | Open the details of a text and of a voice prayer | the questions, the answers and the recordings are linked correctly |
| JRN-006 | On Android, finish a prayer after using audio, then play its journal recording; pause, let it finish, close the details and start another one; separately simulate a native error or a player that never starts | each recording starts audibly after the audio session was deactivated; two sources never play at once; pause, finish, row switch and failure release the lease and reset playback; unmount releases the lease without native player calls (unit: `journalPlaybackOperation.test.mjs`) |
| JRN-007 | Delete a prayer, including with a two-line confirmation label | visual, checked manually: the trash icon and both lines stay inside the confirmation button, and the adjacent Share button remains in place; the session, the answers, the recording rows and the files are deleted; the day stays marked while another prayer started that day is in the journal, and deleting the last one removes the mark (ADR-0042, `journalDays.test.mjs`) |
| JRN-008 | A restart and installing a new build over the old one | SQLite and the audio files survive and are readable |
| JRN-009 | The recording file is missing but the database row remains (as after an Android cloud restore, ADR-0040), and separately a file that exists but fails to load | the screen does not crash; a missing file keeps its row with the duration and the transcript, the play button is disabled and dimmed, the row says "Audio is not on this device" in the interface language, Transcribe and Retry are not offered, and a `recording_audio_missing` record is appended to `lampada-diagnostics.log` (also when the file disappears after the prayer was opened and play is pressed); a file that fails to load does not stay shown as playing, the row says the recording could not be played, and a `recording_playback_failed` record is appended (`journalDetail.test.mjs` covers the file check and the diagnostics; the on-screen state is `ios-stage06-jrn-009-missing-file.yaml` with a hand-deleted file on iOS and MANUAL_CHECKS sitting 12 on Android) |
| JRN-010 | Open a voice answer without text and press "Transcribe" | loading appears, then the text under the corresponding audio player; after reopening the text is still there |
| JRN-011 | Search by a word from a transcript in a different case | the right prayer is found |
| JRN-012 | Get HTTP 413, 429, 5xx, a timeout, or a disconnected network in the journal and retry | the cause is explained in plain language, the audio stays available, and a repeated attempt can save the text |
| JRN-013 | Close the details or delete the prayer during transcription | the request is cancelled, a late response does not bring the deleted data back into the UI or the database |
| JRN-014 [rare] | Share an expanded prayer | the system share sheet opens with plain text carrying localized labels (`Topic:`, `Date:`, `Duration:`, `Question N:`, `Answer:`, `Voice note:`, `Saved passages:`, `Takeaway:`) and `———` separators between the meta block, the questions, the closing block and the app name; no audio file is attached and cancelling changes nothing |
| JRN-015 | Android 12+ emulator, cloud backup and restore (ADR-0040). Enable the app lock, save a prayer with a text answer and a transcribed recording. Run `adb shell bmgr enable true`, `adb shell bmgr transport com.android.localtransport/.LocalTransport`, `adb shell settings put secure backup_local_transport_parameters 'is_encrypted=true'`, `adb shell bmgr backupnow app.lampada`; pull every APK listed by `adb shell pm path app.lampada`, run `adb shell pm uninstall --user 0 app.lampada` and `adb install-multiple -t --user 0 <the pulled APKs>` (the install restores the backup), then `adb shell bmgr transport com.google.android.gms/.backup.BackupTransportService` | `backupnow` prints `Package app.lampada with result: Success`; the app starts without the lock screen and the settings show the protection off; the journal shows the prayer with its answer, takeaway, transcript and recording row; the recording row says the audio is not on this device (JRN-009); the streak and settings are kept |
| JRN-016 | Android 12+ emulator, device-to-device transfer. Same data as JRN-015. Run `adb shell bmgr enable true`, `adb shell settings put secure backup_enable_d2d_test_mode 1`, `adb shell bmgr transport com.google.android.gms/.backup.migrate.service.D2dTransport`, `adb shell bmgr init com.google.android.gms/.backup.migrate.service.D2dTransport`, `adb shell bmgr backupnow app.lampada`; pull the APKs, `adb shell pm uninstall --user 0 app.lampada`, `adb shell bmgr transport com.google.android.gms/.backup.BackupTransportService`, `adb install-multiple -t --user 0 <the pulled APKs>`; clean up with `bmgr init` of the D2D transport, `settings put secure backup_enable_d2d_test_mode 0` and the GMS transport again | as in JRN-015, and the recording also plays |
| JRN-017 | On Android, play a journal recording while the native player ignores `play()` | within two seconds the row stops showing pause and says the recording could not be played; a `recording_playback_failed` record with `place: journal` and `reason: not_started` is appended (unit: `nativePlaybackStart.test.mjs`) |
| JRN-018 | Reading the journal, opening a prayer or deleting it fails in SQLite | the list says "Could not open the journal. Tap to try again." instead of the empty-journal text and a tap retries; an expanded prayer says "Could not open this prayer. Please try again."; a failed delete keeps the row and shows "Could not delete the prayer" with "Please try again."; each failure appends `journal_failed` with the action (manual, fault injection) |

### Prayer reminders

| ID | Scenario | Expected result |
|---|---|---|
| REM-001 | Turn the reminders on for the first time | the system permission prompt appears once, at the moment of turning them on, not at app start |
| REM-002 | Deny the permission | the toggle stays off, the settings screen works, a clear text about the system settings is shown |
| REM-003 | Grant the permission in the system settings and return to the app | the schedule is set up without restarting the app |
| REM-004 | Set the nearest time and wait for it | the notification arrives with a phrase from the pool |
| REM-005 | Set several times and a subset of weekdays | the schedule line reads correctly, a notification arrives at every set time |
| REM-006 | Restart the app | the schedule is preserved, the phrase in the next notification may differ from the previous one |
| REM-007 | Reboot the device | the scheduled reminder still arrives |
| REM-008 | Turn the reminders toggle off | every scheduled notification is cancelled, nothing arrives |
| REM-009 | Tap a notification from Home or from the journal | Home opens |
| REM-010 | Tap a notification during an ongoing prayer | the session is not interrupted, the user is not thrown out of the prayer |
| REM-011 | A notification arrives while the app is open | it is shown as a banner rather than silently dropped |
| REM-012 | A reminder during an active prayer timer | the ongoing chronometer (ADR-0010) does not disappear and is not replaced |
| REM-013 | Pray, then wait for the reminder time on the same day | the reminder arrives: it was agreed to remind unconditionally |
| REM-014 | Tap the trash button for a rule or time, then tap it again within three seconds | the first tap highlights the button without deleting; the second deletes only the selected item |
| REM-015 | Arm deletion, then wait three seconds, edit the schedule, close the editor or background the app | confirmation clears; deleting again requires two taps; arming a different target cancels the previous one |
| REM-016 | Saving the schedule, checking the permission or scheduling in the system fails, including the sync on launch | the settings show "Could not update reminders. Please try again." under the toggle and in the editor until a later sync succeeds; nothing is reported as zero scheduled reminders; a `reminders_failed` record with the step and place is appended (unit: `prayerReminderScheduler.test.mjs`) |
| REM-017 | The saved schedule in `meta.prayer_reminders` is unreadable | the default schedule is shown with "Could not read the saved reminder schedule. Set up reminders again." until the schedule is saved; a `reminder_schedule_invalid` record is appended; a missing schedule shows no warning (unit: `scriptureInitialization.test.mjs`) |

REM-004/005/008 run through `e2e/run-rem-fire.sh`. Their clock-dependent flows
are in `reminder-fire/`, outside the tier scan; the runner generates the required
time-setting helper and captures the REM-008 screen at the scheduled time.

### App lock

For Russian and Ukrainian, Settings, the PIN and biometric prompts, content
reports, OS permission texts, and error messages address the user informally
(«ты» / «ти»). English copy is unchanged; Scripture quotations retain their
source wording.

The protection is optional and off by default; the decision and its boundaries
are in
[ADR-0014](../architect/decisions/0014-app-lock-pin-and-biometrics.md).
The mapping of a biometric prompt result to the lock screen outcome
(cancellation, `authentication_failed` and other errors shown in words) has
unit coverage in `lib/__tests__/lockBiometrics.test.mjs`.

| ID | Scenario | Expected result |
|---|---|---|
| LOCK-001 [main] | The protection was never enabled | no screen asks for a code, the settings have no line for changing it |
| LOCK-002 | Enable a six-digit PIN and restart the app | the input is finished only by the user's confirmation, a cold start opens the lock screen, the content is hidden |
| LOCK-003 | A wrong, then a correct code on the lock screen | the wrong one keeps the user on the screen with an error, the correct one lets them in without a separate confirmation |
| LOCK-004 | Change the PIN to a code of a different length | the change requires the current code, the new one lets the user in, the old one does not, the screen waits for the new number of digits |
| LOCK-005 | Disable the protection | cancelling and a wrong code do not remove it, the correct one does, a cold start no longer asks for a code |
| LOCK-006 | "Forgot your PIN?" and two confirmations | cancelling at either of the two steps erases nothing, confirming wipes the journal and removes the protection |
| LOCK-007 | Returning from the background before and after a minute | a short switch does not ask for the code, more than a minute does; the app process is not restarted |
| LOCK-008 | The app snapshot in the task switcher | the privacy screen is shown instead of the content |
| LOCK-009 | Entry by biometrics on iOS and Android | the toggle is available only with the PIN enabled and a sample enrolled, a mismatch shows the native retry prompt, a refusal or its PIN action returns to the app lock screen, and only the correct code grants entry; iOS names Face ID or Touch ID; Android shows complete phrases for face, fingerprint or biometrics in the interface language (a specific method only when the device reports one type) and never Face ID or Touch ID, in the settings row, the system prompt title, the enable error and the lock screen (`biometryText.test.mjs`) |
| LOCK-010 | The biometric samples are removed in the system after the toggle was enabled | the lock screen does not offer biometrics, the code keeps working |
| LOCK-011 | The PIN and its hash in the logs and in the storage | the PIN is nowhere stored and nowhere logged, the Keychain holds only the salt, hash, PIN length, enabled flag and optional biometrics flag |
| LOCK-012 | SecureStore fails to read, write or delete a lock key; during "Forgot your PIN?", separately fail deletion of the enabled flag, deletion of another key, and cancellation of reminders | a read failure opens the app unlocked as before; a failed write or delete is not reported as success (disabling the lock shows the PIN error, the biometrics toggle shows "Could not continue"); failure to delete the enabled flag wipes nothing and keeps the lock screen available for retry; after that flag is deleted, a remaining-key failure resets the wiped stores and cannot re-enable the old lock on launch; each SecureStore failure appends `secure_store_failed` with the operation and key name, never a value; reminder cancellation failure still permits the wipe, then says "Data erased, but reminders were not removed" and appends `wipe_incomplete` (unit: `lockWipe.test.mjs`) |

## 9. Non-functional checks

### Interface and accessibility

- screens 320-430 pt wide, iPhones with and without a Dynamic Island;
- an iPad in portrait and landscape orientations;
- the keyboard does not cover the field and the main actions;
- outside taps, including both tablet margins, dismiss the keyboard in setup,
  reflection, journal search and the answer sheet; inside taps retain editing,
  and dismissing the keyboard preserves the entered text;
- long Russian strings are not clipped in a damaging way;
- the buttons have a sufficient tap area and clear accessibility labels;
- enlarged system text, VoiceOver/TalkBack, Reduce Motion;
- the contrast of the text, of the toggle states and of the delete
  confirmations.

### Reliability and performance

- a cold start without a white or frozen screen;
- no noticeable stutter in the timer and flame animations;
- typing in the answer field during a running session stays smooth (ANS-034);
- no memory growth after 10 sheet openings and playbacks;
- correctness after background/foreground, screen lock and a system call;
- no leftover timers, microphone recording or audio player after leaving a
  screen.
- covered routes (including the PIN, privacy and update overlays) and closed
  sheets have no running visual work; music and the lock-screen timer retain
  their intended background behavior (SES-009).

### Security and privacy

- the Google / server master key is absent from the client bundle and the logs;
- the client proxy key is treated as public and limited;
- the topic, answer context and audio upload each require their own current,
  versioned `allowed` decision; missing and legacy permissive values do not open
  a gate;
- denied core AI sends neither `topic` nor `user_replies`; denied answer context
  omits the field instead of sending an empty placeholder;
- audio files are stored in the expected directory and reach the transcription
  endpoint only after both an explicit press and transcription consent;
- the Android backup rules contain the journal database, recordings only for
  device transfer, and never `shared_prefs/SecureStore.xml`
  (`androidBackupRules.test.mjs`, JRN-015, JRN-016);
- before routing transcription to Google Gemini, the published Privacy Policy
  names that audio route and the paid-API processing terms match the consent;
- the server logs and persistent storage contain neither the audio, nor the file
  name, nor the transcript;
- the logs contain no prayer answers, tokens or full network payloads;
- the system description of the microphone permission matches its actual use.
- before release, verify App Store App Privacy lists Other User Content,
  Product Interaction, Performance Data and Other Diagnostic Data as not linked
  to the user and confirms no tracking.

## 10. Automation plan

### Stage A - the basic checks

1. Keep `typecheck` a mandatory local and CI gate.
2. Add Expo Doctor to a reproducible check of the environment.
3. Add unit tests of the pure logic: declensions, the time format, calendar days,
   the choice of questions and the parsing of the AI JSON.
4. Add integration tests of the storage and the state with a controlled clock and
   mocks of SQLite, the files and the AI client.

### Stage B - UI and E2E

1. Choose a runner after a trial scenario on a real build; evaluate Maestro and
   Detox first.
2. Automate the smoke without the microphone and the external AI.
3. Add stable testIDs and accessibility labels only where selectors by user-facing
   text are unreliable.
4. Leave audio, system permissions, background/foreground and visual defects as
   hybrid scenarios with a manual check on a physical device.

## 11. Defect classification

| Severity | Meaning |
|---|---|
| Critical | loss or leak of data, a crash on the main scenario, the app cannot be launched |
| Major | the main scenario cannot be completed without a workaround; data is saved incorrectly |
| Minor | a feature works with a noticeable defect or inconvenience, a simple workaround exists |
| Trivial | a cosmetic problem with no effect on completing the scenario |

The fix priority (`P0-P3`) is assigned separately from the severity, taking the
frequency and the value of the scenario into account.

## 12. Exit criteria of the first run

The run is complete when:

- every `PRE`, `SMK` and functional scenario of the first iOS environment has been
  executed;
- every scenario is marked `Passed`, `Failed`, `Blocked` or `Not run`;
- every `Failed` has a ClickUp Bug under the corresponding stage and a piece of
  evidence;
- there are no open Critical defects;
- the Major defects have been analysed and have either a fix or an explicit
  product acceptance of the risk;
- the coverage limitations for Android, iPad, accessibility and background are
  recorded;
- the final report contains the versions, the commit, the exit codes and the full
  logs of the checks.

SCR-013 prepared phases: use a named test simulator or emulator with Russian as
the primary system language and a Release build pointing to
`scripts/scripture-stub.mjs`. iOS: `scripts/test-scripture-initialization.py`;
Android: the SCR-013 section of `scripts/test-android-prepared.py`. Each runner
sets `catalog=fail` via `POST /__control` and runs `*-scripture-catalog-failure`
(the interface is switched to English, a prayer starts and its scripture block
shows the catalog error), then confirms that `meta.scripture_preferences` is
absent. It sets `catalog=ok` and runs `*-scripture-catalog-recovery` (Retry in
the same session shows a passage), then confirms the saved `en/16/151`: the
choice follows the interface, not the system locale. It sets `catalog=fail` and
runs `*-scripture-catalog-saved-offline` (cold start, interface back to Russian),
then confirms `en/16/151` with `ui_language=ru`. SCR-027 runs next with
`catalog=unvoiced-ru` through `*-scripture-catalog-no-default` from a clean
install, then confirms the manually chosen `en/16/151`. The iOS runner reads
the database file from the simulator app container, which leaves the app
running. The Android probe is `am instrument` against the app package, and
Android stops the app to start it, so on Android a probe ends a phase: after the
failure check, `android-scripture-catalog-reopen` cold-starts with `catalog=fail`
still set, checks the English interface saved by the failure phase, and opens a
new prayer with the catalog error; recovery then retries in that prayer, with no
probe in between. The four Android SCR-013 phases are one chain: `--start-at`
accepts only its first phase.

### Shared keyboard regression contract

| ID | Action | Expected result |
| --- | --- | --- |
| KBD-001 [prepared, android] | Run the staged matrix on a named emulator with a docked keyboard for setup, answer, reflection, report and journal | native rectangles fit OS status/navigation/IME boundaries; input does not overlap lower actions; deferred actions are absent; text survives dismissal and persisted answers/notes reopen |
| KBD-002 [prepared, android] | Select the real Gboard floating mode and run the same matrix | no zero-height-as-hide assumption; compact input, existing outside-tap dismissal, complete lower action rectangles above the navigation area, and preserved text |
| KBD-003 [prepared, android] | Boot with an emulated hardware keyboard and run focused-input mode with software display disabled for hardware input, restoring that setting afterward | genuinely focused native input without an onscreen IME; actions remain available; this is a no-software-focus contract, not a physical external-keyboard acceptance claim |
| KBD-004 [prepared, ipad] | Run iPad setup/answer/reflection/report keyboard flows, rotating while typing; check narrow floating mode separately | viewport adapts to actual window bounds; no extra keyboard inset; footer/body remain usable and text is retained |
| KBD-005 [manual, android] | On Fold5 check folded/unfolded, native Samsung floating/docked modes, mode changes and actual Done | no cropped actions or oversized floating input; all fields and existing actions remain usable, without clearing personal app data |

A native bounds assertion is stronger than assertVisible. The independent
`keyboard_layout_bounds.py` reads OS InsetsSource frames and native Maestro hierarchy bounds,
not the app's calculated viewport. Run it only when the Maestro driver has stopped.
The initial oversized-field and cropped-navigation-button fixtures must fail the
validator's own tests. Physical screenshots must be checked before claiming that
a floating panel does not overlap a field; the panel can be moved by the user.

Keyboard submission regression (2026-10-09): preparation and reflection Enter
submit before native dismissal; loss of input focus alone must never reveal
deferred actions. The staged Android setup
restore flow verifies Enter restores duration/Next and preserves the topic.

The iPad staged counterpart (`npm run test:keyboard:ios -- --mode docked`)
measures entire native rectangles against UIKit's keyboard/window frames across
the same five forms. It rejects a partly clipped action even if its center is
visible. UIKit safe-area insets and physical external-keyboard use remain
separate live checks.

Hardware submission regression: goal/reflection Enter and answer Save must release
editor focus even when the
IME is already hidden; an orphaned IME must also hide when RN focus is absent.
`keyboardDismiss.test.mjs` executes the real helper against both native states.

Clearing the journal query continues editing: hardware input remains focused
with no IME, so another query can be typed directly. The staged journal
checkpoint verifies this continuation instead of treating Clear as ending input.

KBD window resize: Android critical changes only the emulator width with the
keyboard/editor open, checks full native bounds and retained focus, restores
the original dimensions, then saves and reopens the exact draft.

JRN-007 prerequisite: scroll until the complete Delete action is visible for
expanded long text/audio details before activating the timed confirmation.

SETUP-004 Android injects its full long goal in bounded driver transactions,
then asserts the complete unchanged text; this avoids a single two-minute RPC
deadline without weakening layout or persistence checks.

### Screenshot layout regression

These are visual checks on the final branch build; no result is implied by
typecheck or unit tests. Compare both platforms where a shared component changed.

| ID | Window and action | Expected result |
| --- | --- | --- |
| LAY-001 | Android 3-button navigation: inspect the Scripture settings card, scroll Settings and a long Scripture reader to the end; open a long journal detail on iPhone and iPad | no top divider precedes Language; dividers precede Translation and Voice; the last content scrolls fully above system controls; the journal has no hard bottom clipping line |
| LAY-002 | iPhone SE, Pixel 3-button, Fold outer and iPad landscape: inspect Home, Settings, Journal, Favourites, About and answer/recordings/reminder sheets; check update and consent overlays; finish a prayer | every window-edge action and screen-ending row reserves bottom inset plus sc(12), including keyboard-sheet footers; KeyboardViewport forms do not reserve the inset twice; the saved notice, streak caption and Start action remain separate |
| LAY-003 | iPad portrait and landscape: open reminder editor, Scripture reader and recordings list | the centered settings sheet caps its width at sc(294), scaling with its steppers and day buttons without overflow; reader header/text use one column() and gutter; recordings question, list and actions share one column and gutter |
| LAY-004 | Focus the setup goal and reflection field on phones, Fold inner, iPad portrait/landscape and Split View | whenever the docked keyboard fills the form, the goal can shrink below sc(120) and stays clear of the keyboard without extra margin or a device condition; outside that state the sc(120) minimum returns; reflection title and column keep their resting size and width |
| LAY-005 | Fold inner short window: open Question and Quote session cards and start a recording; also check a roomy phone sheet and a wrapped recording error | Scripture ends on a whole line with a continuation mark when needed; roomy recording sheets retain sc(24) gaps and sc(48) wave, short ones fit their measured Gorhom scroll viewport and scroll on Android when needed; hint/error never overlap Done |
| LAY-006 | Request the next Scripture passage with a slow response | reference, narration and position dots remain mounted but hidden and inaccessible, passage-bound actions are disabled; text-area height and line limit stay unchanged while loading; the new passage restores the controls |
| LAY-007 | Fold outer: open a journal detail, arm deletion and tap again in the same place; iPhone SE: send a report and observe the sending state; compare Settings, Journal, Favourites and Home on Fold inner | all label states are measured before choosing the paired layout; labels share one font size and stack together if any state would wrap; arming deletion or sending never moves the buttons; screen headers and cards share the same column gutter |
| LAY-008 | Open an answer sheet question with a one-letter Russian or Ukrainian preposition | the preposition stays with the following word at a line break |
| LAY-009 | On iPhone SE and Fold outer, collapse and expand a favourite whose fourth line ends with punctuation; include a partial key-verse selection, rotate and inspect with VoiceOver/TalkBack | the preview fits four measured lines with one manual ellipsis and no trailing whitespace or .,;:!? before it; rotation remeasures; the collapsed accessibility label reads only the selected verses without truncation; expansion reveals the full saved passage |
