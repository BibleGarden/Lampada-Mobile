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
| PRE-005 | Compare `expo.version` with the About footer after a local or preview build and after a production build | a test build shows the next patch of the current store version (`1.1` → `1.1.1`); a production build in TestFlight shows two components with the next minor (`1.1.1` → `1.2`); the update check treats `1.2` and `1.2.0` as equal |

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

### Setup and entering the prayer

| ID | Scenario | Expected result |
|---|---|---|
| SETUP-001 [critical] | Leave the goal empty | free prayer is available, the texts contain no empty or broken phrases |
| SETUP-002 [critical] | Pick each goal example | the modal closes, the chosen text appears in the field |
| SETUP-003 [critical] | Check the 5/15/30/60/∞ presets and the ± buttons | the value and the declension of the minutes are correct, the bounds are safe |
| SETUP-004 [main, ipad] | Edit a long goal on iPhone and iPad; on iPad rotate while typing, then tap above the field and in both side margins | the header, title and the field's top edge stay in place while the field stretches down to the keyboard and scrolls long text inside itself, also after a rotation; duration and "Next" are hidden while typing; taps inside keep editing, outside taps or "Done" restore the actions in place, without a top-left motion or lost text |
| START-001 [critical] | A short hold and moving the finger outside | the progress resets, no session is created |
| START-002 [critical] | A full hold | exactly one session is created and the timer opens |
| START-003 | Repeated gestures during the transition | no parallel sessions are created |
| START-004 | A SQLite error while creating the session | the button does not stay blocked forever, the error is diagnosable |
| START-005 [ipad] | Open the threshold on an iPad with a multi-line goal and rotate between portrait and landscape | landscape shows the briefing and hold-to-start button side by side; all three briefing items fit for a typical multi-line goal; longer content scrolls without covering the button; portrait returns to the vertical layout |

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
| ANS-010 | The timer runs out with the sheet open | a non-interactive notice appears above the sheet; text and recording continue; successful save/close and recording cleanup are followed by reflection after one second |
| ANS-011 | Switch between questions and edit an old answer | the answer is saved under the correct question |
| ANS-012 | Stop a recording and do not press "Transcribe" | the audio recording and the button appear; no network request is made and no tokens are spent |
| ANS-013 | Press "Transcribe", then save while the request is in flight | a loading state appears, after 4 s a hint that the window can be closed; the save waits for the request, the audio and the text are restored after reopening |
| ANS-014 | Get HTTP 413, 429, 5xx, a timeout, or a disconnected network during transcription | each cause has its own plain-language message; the audio stays available, "Retry" is shown, and a repeated attempt can succeed |
| ANS-015 | Delete or cancel a recording during transcription | the request is cancelled, a late response does not bring the deleted recording back into the UI or the database |
| ANS-016 | Open a long transcript in the recordings sheet | the block shows three lines, "Show in full" expands and collapses it; the list of recordings stays scrollable |
| ANS-017 | Press "Add to the answer" on an empty and on a filled answer | the recordings sheet closes, the transcript text is appended to the end of the answer field after a blank line, the transcript itself does not change |
| ANS-018 | Inspect a generated transcript and save the answer | the transcript offers expand/collapse and "Add to the answer", with no separate deletion action; the transcript and audio remain available after reopening |
| ANS-019 [main] | On an empty answer, quickly press the microphone / "Record" again while it is starting | exactly one recorder start happens, the buttons and closing are unavailable until the pending state ends, there is no hidden recording |
| ANS-020 | Quickly press "Done" twice while a recording is stopping | exactly one stop happens, one working recording appears, a successful file is not deleted and no save error is shown |
| ANS-021 [main] | With the music on, save an audio in one question, move to the next one and record a second immediately | both recordings are saved and play back; a late restoration of the music does not cut the second file and the "The recording was not saved" message does not appear |
| ANS-022 [main] | Press "Record another" twice quickly without moving the finger | the second tap does not land on the "Done" button that appeared; the UI stop is unavailable for the first 1.5 seconds, the recording continues, and a file shorter than 0.5 seconds is not added to the list |
| ANS-023 [main] | Open the recordings and start a recording on an iPhone SE / Home Button, an iPhone with a Home Indicator and an iPad | "Record another" and "Done" are fully visible, the bottom frame is not clipped and a margin remains between the button and the screen edge |
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
| SCR-012 | A clean installation with a supported primary device language | the server language of the device and a valid translation/voice triple are chosen |
| SCR-013 [main] | A clean installation with an unsupported device language or an unavailable catalogue | English `en / 16 / 151` is chosen |
| SCR-014 [main] | Change the device language after the setting was saved | the saved user choice is not overridden |
| SCR-015 [rare] | Pause the scripture narration, press resume and immediately switch the mode or the passage | the old passage does not resume after the context changes; the new passage starts normally |
| SCR-016 | Let the timer expire during scripture narration with music enabled | the passage plays to its end; an open reader still postpones completion; once reading and narration finish, reflection opens after one second |
| SCR-017 | Read silently in the expanded reader when time expires; continue scrolling, then close the reader | the notice does not intercept touches or close the passage; closing the reader returns to the timer, then reflection opens after one second |
| SCR-018 | Reopen the reader, pause/resume narration, open an answer or add time during the one-second delay | the pending transition is cancelled; open activities and audio errors remain visible; extra time resets expiry; completion runs once |
| SCR-019 | Compare a compact quote with the full passage in the reader, favourites and journal | key verses retain the card's off-white colour; surrounding verses use the same colour at 55% opacity; narration uses a translucent white underline; passages without key verses remain at full opacity |
| SCR-020 | A launch and navigation with no network | at most seven recently shown compatible passages are available; with an empty cache there is a neutral error and a retry |
| SCR-021 | Recover the network while an offline passage is visible and press its retry label | a fresh server passage replaces the offline frontier without walking to the end of the saved history |
| SCR-022 | A response with a canonical Psalm 23 and a translated Psalm 22 | the reference is built as "Psalm 22", from `passage` |
| SCR-023 | A response with `history_reset: true` | the exclusions are reset, the current ID is added again, the trail and the favourites are preserved |
| SCR-024 | A text shorter than 160 characters wraps onto more than three lines | the card shows "Read in full", the reader opens the whole passage |
| SCR-025 [main] | Expand the reader as far as possible with a long passage on an iPhone with a Dynamic Island | the top of the reader stays below the status bar; the title and the buttons are not overlapped |
| SCR-026 | Start narration, cover the session with the PIN screen or background the app, then return | narration continues from its current position without restarting; the session timer expires on schedule, but reflection waits until the prayer screen is visible |

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
| RPT-002 | Switch to Quote, open the card-corner report dialog, add a comment and send | the reader has no report button; the request carries `content_type: "scripture"`, the full passage reference, title when present, text, the trimmed comment and the interface language; a success state is shown |
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
| END-005 | Finishing around midnight and after a time zone change | the prayer counts for the local calendar day it started on; the streak and the seven dots agree with it (unit tests in `sessionResume.test.mjs`) |
| END-007 | Leave an expired prayer overnight, open the app the next day and finish it on reflection | the prayer counts for the day it started, not the day of "Done"; the streak stays unbroken |
| END-006 [main, ipad] | Enter a takeaway with the keyboard open on iPhone and iPad; on iPad, rotate while typing | the input stays above the keyboard; on tablets the editing column widens and long content is scrollable; the hidden actions do not glow through the keyboard; "Done" or a tap outside restores the finish and back actions without losing text |
| END-008 | Type a takeaway with a hardware keyboard in an App Store video build | while the input is focused, the visible flame stays on one frame and each non-whitespace character causes a visible text or caret update; after blur the flame animates again; ordinary builds never freeze the flame (`reflectionFlame.test.mjs`). The ANS-034 smoothness expectation is a 150 ms maximum visible gap, reported as a metric in the video pipeline; its gross recording rejection gate is 250 ms. |
| END-009 | Finish the prayer while the first question is still loading | the reflection question appears; the late first question does not leave reflection loading |

### The journal and local data

| ID | Scenario | Expected result |
|---|---|---|
| JRN-001 [critical] | An empty history | a clear empty state without an error |
| JRN-002 [main] | An abandoned empty session | it is not shown in the journal |
| JRN-003 | Search by the goal, the takeaway, a question and an answer | the right records are found |
| JRN-004 | A Cyrillic search in a different case | the search stays case-insensitive |
| JRN-005 [main] | Open the details of a text and of a voice prayer | the questions, the answers and the recordings are linked correctly |
| JRN-006 | Play an audio, close the details, start another one | two sources never play at once, the player UI is reset |
| JRN-007 | Delete a prayer, including with a two-line confirmation label | visual, checked manually: the trash icon and both lines stay inside the confirmation button, and the adjacent Share button remains in place; the session, the answers, the recording rows and the files are deleted; the streak day remains |
| JRN-008 | A restart and installing a new build over the old one | SQLite and the audio files survive and are readable |
| JRN-009 | The recording file is missing but the database row remains | the screen does not crash, the problem is handled or clearly reported |
| JRN-010 | Open a voice answer without text and press "Transcribe" | loading appears, then the text under the corresponding audio player; after reopening the text is still there |
| JRN-011 | Search by a word from a transcript in a different case | the right prayer is found |
| JRN-012 | Get HTTP 413, 429, 5xx, a timeout, or a disconnected network in the journal and retry | the cause is explained in plain language, the audio stays available, and a repeated attempt can save the text |
| JRN-013 | Close the details or delete the prayer during transcription | the request is cancelled, a late response does not bring the deleted data back into the UI or the database |
| JRN-014 [rare] | Share an expanded prayer | the system share sheet opens with plain text carrying localized labels (`Topic:`, `Date:`, `Duration:`, `Question N:`, `Answer:`, `Voice note:`, `Saved passages:`, `Takeaway:`) and `———` separators between the meta block, the questions, the closing block and the app name; no audio file is attached and dismissing the native popover through its accessibility action changes nothing |

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

REM-004/005/008 run through `e2e/run-rem-fire.sh`. Their clock-dependent flows
are in `reminder-fire/`, outside the tier scan; the runner generates the required
time-setting helper and captures the REM-008 screen at the scheduled time.

### App lock

The protection is optional and off by default; the decision and its boundaries
are in
[ADR-0014](../architect/decisions/0014-app-lock-pin-and-biometrics.md).

| ID | Scenario | Expected result |
|---|---|---|
| LOCK-001 [main] | The protection was never enabled | no screen asks for a code, the settings have no line for changing it |
| LOCK-002 | Enable a six-digit PIN and restart the app | the input is finished only by the user's confirmation, a cold start opens the lock screen, the content is hidden |
| LOCK-003 | A wrong, then a correct code on the lock screen | the wrong one keeps the user on the screen with an error, the correct one lets them in without a separate confirmation |
| LOCK-004 | Change the PIN to a code of a different length | the change requires the current code, the new one lets the user in, the old one does not, the screen waits for the new number of digits |
| LOCK-005 | Disable the protection | cancelling and a wrong code do not remove it, the correct one does, a cold start no longer asks for a code |
| LOCK-006 | "Forgot your PIN?" and two confirmations | cancelling at either of the two steps erases nothing, confirming wipes the journal and removes the protection |
| LOCK-007 | Returning from the background before and after a minute | a short switch does not ask for the code, more than a minute does; the app process is not restarted |
| LOCK-008 | The app snapshot in the task switcher | the privacy screen is shown instead of the content; inspect the Device Hub App Switcher screenshot after preparing the flow |
| LOCK-009 | Entry by Face ID / Touch ID | the toggle is available only with the PIN enabled and a sample enrolled, a mismatch shows the native retry prompt, its PIN action returns to the app lock screen, and only the correct code grants entry |
| LOCK-010 | The biometric samples are removed in the system after the toggle was enabled | the lock screen does not offer biometrics, the code keeps working |
| LOCK-011 | The PIN and its hash in the logs and in the storage | the PIN is nowhere stored and nowhere logged, the Keychain holds only the salt, hash, PIN length, enabled flag and optional biometrics flag; the tracked cleanup flow disables the test PIN and cleanup failure fails the runner |

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
