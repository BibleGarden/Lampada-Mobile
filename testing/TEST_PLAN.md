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

Expo Go is not to be used: it lacks some of the native modules of the project.

## 7. Smoke scenario

The smoke counts as passed only in full.

| ID | Actions | Expected result |
|---|---|---|
| SMK-001 | A cold start | the home screen appears without freezing or errors |
| SMK-002 | Open the prayer setup, set a goal and 5 minutes | the values are displayed and lead to the threshold screen |
| SMK-003 | Release the hold too early, then hold it fully | the first gesture is cancelled, the second starts exactly one session |
| SMK-004 | Open the answer, save the text | the answer is marked as saved and is not lost |
| SMK-005 | Finish early, save the takeaway | the successful finish screen opens |
| SMK-006 | Go back Home and open the journal | the prayer, the answer and the takeaway are there |
| SMK-007 | Force-quit and open the app again | the saved data and the streak remain |

## 8. Functional scenarios

### Home screen and navigation

| ID | Scenario | Expected result |
|---|---|---|
| NAV-001 | The first launch with a clean database | a correct greeting, an empty week, the journal, the settings and the start available |
| NAV-002 | Returning Home after an unfinished setup | the draft session is reset, the app does not hang |
| NAV-003 | Opening screens by a deep link with no navigation history | the back button leads Home or closes the screen safely |
| NAV-004 | Android Back during the prayer and the reflection | the system gesture does not break the mandatory flow |
| NAV-005 | Fast repeated presses on the transitions | no duplicate screens or sessions are created |

### Setup and entering the prayer

| ID | Scenario | Expected result |
|---|---|---|
| SETUP-001 | Leave the goal empty | free prayer is available, the texts contain no empty or broken phrases |
| SETUP-002 | Pick each goal example | the modal closes, the chosen text appears in the field |
| SETUP-003 | Check the 5/15/30/60/∞ presets and the ± buttons | the value and the declension of the minutes are correct, the bounds are safe |
| SETUP-004 | A long goal and an open keyboard | the field stays manageable, the "Next" button is available once the keyboard is closed |
| START-001 | A short hold and moving the finger outside | the progress resets, no session is created |
| START-002 | A full hold | exactly one session is created and the timer opens |
| START-003 | Repeated gestures during the transition | no parallel sessions are created |
| START-004 | A SQLite error while creating the session | the button does not stay blocked forever, the error is diagnosable |

### The timer and the prayer flow

| ID | Scenario | Expected result |
|---|---|---|
| SES-001 | A finite timer | it decreases every second and opens the reflection exactly once at zero |
| SES-002 | The ∞ mode | the elapsed time is displayed, there is no automatic finish |
| SES-003 | Change the timer with the − / + buttons | the time changes by the expected step and never becomes invalid |
| SES-004 | Background the app and come back after 10-60 seconds | the timer behaviour matches the chosen product policy; any divergence is recorded |
| SES-005 | Finish early | an open answer is saved, then the reflection opens once |
| SES-006 | Choose "Back to prayer" on the reflection | a new countdown starts with the same goal, without losing the already saved answers |
| SES-007 | A very long goal | the text does not overlap the timer and the companion panel |

### Background music

| ID | Scenario | Expected result |
|---|---|---|
| MUS-001 | Turn the music on and off with the button in the session | the button and the indicator change state, playback starts and stops |
| MUS-002 | Launch the app with no network and turn the music on | the bundled pieces are fully available offline |
| MUS-003 | Wait for the end of the playlist | fifteen tracks play in sequence and the loop starts again |
| MUS-004 | Background the app with the music on and come back | in the background the music is paused and resumes after the return if the state was on |
| MUS-005 | With the music on, record a voice answer and listen to the draft | the music stops before the recording or the playback begins and resumes afterwards; it is not present in the voice recording |
| MUS-006 | Finish the prayer early or by the timer | the music player stops and does not play on the reflection, the finish and the next session screens |
| MUS-007 | Let the timer reach zero with the music on | the transition to the reflection does not cause the `ERR_NATIVE_SHARED_OBJECT_NOT_FOUND` crash after the playlist is removed |
| MUS-008 | Start several prayers in a row | the starting track is chosen at random and does not repeat the start of the previous session within the current app launch |

### Answers and audio

| ID | Scenario | Expected result |
|---|---|---|
| ANS-001 | Save a text, open the same question again | the saved text is restored |
| ANS-002 | Close an empty sheet | it closes without an extra confirmation |
| ANS-003 | Close an unsaved non-empty answer | an explicit second confirmation is required, the data is not lost silently |
| ANS-004 | Deny access to the microphone | the app does not crash and stays usable |
| ANS-005 | Record and stop one audio | a recording with a non-zero duration appears and plays |
| ANS-006 | Create several recordings | the files differ, the earlier recordings are not overwritten |
| ANS-007 | Save while a recording is active | the recording is stopped and saved correctly |
| ANS-008 | Delete a recording with a confirmation | the recording disappears from the UI, the database and the files after saving |
| ANS-009 | Try to close the recordings sheet by a swipe or by the background during a recording | the sheet does not close; the microphone stays under visible control until "Done"; after stopping the sheet closes the usual way |
| ANS-010 | The timer runs out with the sheet open | the timer stays at `0:00` with a "finish your answer" hint; the text and the recording are not cut off; the transition to the reflection happens once, after an explicit save or after the sheet is closed |
| ANS-011 | Switch between questions and edit an old answer | the answer is saved under the correct question |
| ANS-012 | Stop a recording and do not press "Transcribe" | the audio recording and the button appear; no network request is made and no tokens are spent |
| ANS-013 | Press "Transcribe", then save while the request is in flight | a loading state appears; the save waits for the request, the audio and the text are restored after reopening |
| ANS-014 | Get an offline, a timeout or an HTTP error from the transcription | the audio stays available, "Retry" is shown, a repeated attempt can succeed |
| ANS-015 | Delete or cancel a recording during transcription | the request is cancelled, a late response does not bring the deleted recording back into the UI or the database |
| ANS-016 | Open a long transcript in the recordings sheet | the block shows three lines, "Show in full" expands and collapses it; the list of recordings stays scrollable |
| ANS-017 | Press "Add to the answer" on an empty and on a filled answer | the recordings sheet closes, the transcript text is appended to the end of the answer field after a blank line, the transcript itself does not change |
| ANS-018 | Remove the transcript with the cross and save | the card returns to a single line with a "Transcribe" button, the recording remains, the text moved into the answer does not disappear |
| ANS-019 | On an empty answer, quickly press the microphone / "Record" again while it is starting | exactly one recorder start happens, the buttons and closing are unavailable until the pending state ends, there is no hidden recording |
| ANS-020 | Quickly press "Done" twice while a recording is stopping | exactly one stop happens, one working recording appears, a successful file is not deleted and no save error is shown |
| ANS-021 | With the music on, save an audio in one question, move to the next one and record a second immediately | both recordings are saved and play back; a late restoration of the music does not cut the second file and the "The recording was not saved" message does not appear |
| ANS-022 | Press "Record another" twice quickly without moving the finger | the second tap does not land on the "Done" button that appeared; the UI stop is unavailable for the first 1.5 seconds, the recording continues, and a file shorter than 0.5 seconds is not added to the list |
| ANS-023 | Open the recordings and start a recording on an iPhone SE / Home Button, an iPhone with a Home Indicator and an iPad | "Record another" and "Done" are fully visible, the bottom frame is not clipped and a margin remains between the button and the screen edge |
| ANS-024 | With the keyboard open, open the existing voice recordings | the keyboard closes before the sheet is shown, the list and the bottom button are fully reachable |
| ANS-025 | With VoiceOver, check a short and a long transcript | the text is read out in full; a short text is not announced as a button; for a long text "Show in full"/"Collapse" is a separate focusable button |
| ANS-026 | During a recording, simulate an interruption or a media services reset as far as the device allows | the false recording overlay disappears, the audio focus is released and the next recording starts normally |
| ANS-027 | On physical iOS, record quiet speech and pauses of at least 4 seconds | a valid M4A is saved regardless of the actual AAC bitrate, and the recording is fully audible on playback |
| ANS-028 | On physical iOS, create two recordings with different spoken markers in different questions, save and reopen | both recordings belong to their own questions, are not overwritten and play the correct marker after reopening |
| ANS-029 | On physical iOS, perform 10 cycles of start → stop → play without restarting the app | every cycle creates one new valid M4A; there is no save error, no stuck overlay and no unavailable next start |
| ANS-030 | On physical iOS, start a recording right after pausing or finishing a draft or the scripture narration | the deferred deactivation of the player does not cut the recorder; the M4A duration matches the speech and playback does not jump to the end |
| ANS-031 | On physical iOS, record two different files in a row and play the second, the first and the second in turn | every replace waits for its own AVPlayerItem to load, starts from zero and plays the correct file in full |

### The AI and the companion

| ID | Scenario | Expected result |
|---|---|---|
| AI-001 | The AI variables are missing | the local questions are used, the main flow works |
| AI-002 | Successful AI responses | the questions are not empty, the transitions are not blocked |
| AI-003 | A timeout, offline, HTTP 4xx/5xx and invalid JSON | there is a safe fallback, no endless loading and no unhandled rejection |
| AI-004 | Finish or reset the session quickly while a request is unfinished | a late response does not change the new session |
| AI-005 | "Use my answers" is off | the text of the answers is absent from the AI request |
| AI-006 | The setting is on | the UI warns about the sending explicitly; only the expected text is sent |
| AI-007 | Change the setting and restart the app | the chosen value is restored from SQLite |
| AI-008 | Slow the AI down and check the entry and several rotations | a ready question appears without a loader; a pending request waits for its own result without a second request and without a premature fallback; the refill starts after the display |
| AI-009 | Finish the prayer with a fast, a slow and an unavailable AI | the closing question is prepared 15 seconds before zero; a ready one is shown immediately, a pending one shows a loader without an intermediate fallback; changing the answer in the last 15 seconds updates the prefetch; a real fallback is explicitly marked as such |

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
| SCR-008 | Choose a language, a translation and a narration, save and restart the app | the complete triple is restored, a new session sends the chosen `language` and `translation` |
| SCR-009 | Change the language, then the translation | the child lists are cleared; an incompatible or incomplete triple cannot be saved |
| SCR-010 | Open the settings with no network or with a catalogue error | the saved labels are visible, a retry is available, the previously saved choice is not damaged |
| SCR-011 | Switch the language or the translation once an offline cache exists | the offline fallback does not show a snapshot of another language or translation |
| SCR-012 | A clean installation with a supported primary device language | the server language of the device and a valid translation/voice triple are chosen |
| SCR-013 | A clean installation with an unsupported device language or an unavailable catalogue | English `en / 16 / 151` is chosen |
| SCR-014 | Change the device language after the setting was saved | the saved user choice is not overridden |
| SCR-015 | Pause the scripture narration, press resume and immediately switch the mode or the passage | the old passage does not resume after the context changes; the new passage starts normally |
| SCR-008 | A launch and navigation with no network | the cache of shown passages is used; with an empty cache there is a neutral error and a retry |
| SCR-009 | A response with a canonical Psalm 23 and a translated Psalm 22 | the reference is built as "Psalm 22", from `passage` |
| SCR-010 | A response with `history_reset: true` | the exclusions are reset, the current ID is added again, the trail and the favourites are preserved |
| SCR-011 | A text shorter than 160 characters wraps onto more than three lines | the card shows "Read in full", the reader opens the whole passage |
| SCR-012 | Expand the reader as far as possible with a long passage on an iPhone with a Dynamic Island | the top of the reader stays below the status bar; the title and the buttons are not overlapped |

### Reflection, finishing and the streak

| ID | Scenario | Expected result |
|---|---|---|
| END-001 | Finish without a takeaway | the session finishes, an empty takeaway card is not shown |
| END-002 | Finish with a takeaway | the text is shown on the final screen and in the journal |
| END-003 | A double press on finishing | the finish and the day mark happen exactly once |
| END-004 | Two prayers in one day | the day counts once, both meaningful sessions are in the journal |
| END-005 | Finishing around midnight and after a time zone change | the streak and the seven dots agree with the local calendar date |
| END-006 | Enter a takeaway with the keyboard open | the screen switches to a compact mode: the question and the whole input card are visible above the keyboard; after "Done" the finish and back actions are visible |

### The journal and local data

| ID | Scenario | Expected result |
|---|---|---|
| JRN-001 | An empty history | a clear empty state without an error |
| JRN-002 | An abandoned empty session | it is not shown in the journal |
| JRN-003 | Search by the goal, the takeaway, a question and an answer | the right records are found |
| JRN-004 | A Cyrillic search in a different case | the search stays case-insensitive |
| JRN-005 | Open the details of a text and of a voice prayer | the questions, the answers and the recordings are linked correctly |
| JRN-006 | Play an audio, close the details, start another one | two sources never play at once, the player UI is reset |
| JRN-007 | Delete a prayer | the session, the answers, the recording rows and the files are deleted; the streak day remains |
| JRN-008 | A restart and installing a new build over the old one | SQLite and the audio files survive and are readable |
| JRN-009 | The recording file is missing but the database row remains | the screen does not crash, the problem is handled or clearly reported |
| JRN-010 | Open a voice answer without text and press "Transcribe" | loading appears, then the text under the corresponding audio player; after reopening the text is still there |
| JRN-011 | Search by a word from a transcript in a different case | the right prayer is found |
| JRN-012 | Get a transcription error in the journal and retry | the audio stays available, a repeated attempt can save the text |
| JRN-013 | Close the details or delete the prayer during transcription | the request is cancelled, a late response does not bring the deleted data back into the UI or the database |

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

### App lock

The protection is optional and off by default; the decision and its boundaries
are in
[ADR-0014](../architect/decisions/0014-app-lock-pin-and-biometrics.md).

| ID | Scenario | Expected result |
|---|---|---|
| LOCK-001 | The protection was never enabled | no screen asks for a code, the settings have no line for changing it |
| LOCK-002 | Enable a six-digit PIN and restart the app | the input is finished only by the user's confirmation, a cold start opens the lock screen, the content is hidden |
| LOCK-003 | A wrong, then a correct code on the lock screen | the wrong one keeps the user on the screen with an error, the correct one lets them in without a separate confirmation |
| LOCK-004 | Change the PIN to a code of a different length | the change requires the current code, the new one lets the user in, the old one does not, the screen waits for the new number of digits |
| LOCK-005 | Disable the protection | cancelling and a wrong code do not remove it, the correct one does, a cold start no longer asks for a code |
| LOCK-006 | "Forgot your PIN?" and two confirmations | cancelling at either of the two steps erases nothing, confirming wipes the journal and removes the protection |
| LOCK-007 | Returning from the background before and after a minute | a short switch does not ask for the code, more than a minute does; the app process is not restarted |
| LOCK-008 | The app snapshot in the task switcher | the privacy screen is shown instead of the content |
| LOCK-009 | Entry by Face ID / Touch ID | the toggle is available only with the PIN enabled and a sample enrolled, a refusal leaves entry by code |
| LOCK-010 | The biometric samples are removed in the system after the toggle was enabled | the lock screen does not offer biometrics, the code keeps working |
| LOCK-011 | The PIN and its hash in the logs and in the storage | the PIN is nowhere stored and nowhere logged, the Keychain holds only the salt and the hash |

## 9. Non-functional checks

### Interface and accessibility

- screens 320-430 pt wide, iPhones with and without a Dynamic Island;
- an iPad in the supported portrait orientation;
- the keyboard does not cover the field and the main actions;
- long Russian strings are not clipped in a damaging way;
- the buttons have a sufficient tap area and clear accessibility labels;
- enlarged system text, VoiceOver/TalkBack, Reduce Motion;
- the contrast of the text, of the toggle states and of the delete
  confirmations.

### Reliability and performance

- a cold start without a white or frozen screen;
- no noticeable stutter in the timer and flame animations;
- no memory growth after 10 sheet openings and playbacks;
- correctness after background/foreground, screen lock and a system call;
- no leftover timers, microphone recording or audio player after leaving a
  screen.

### Security and privacy

- the Google / server master key is absent from the client bundle and the logs;
- the client proxy key is treated as public and limited;
- the text of the answers is sent only when the setting is on;
- the audio files are stored in the expected directory and sent to the
  transcription endpoint only after an explicit press;
- the server logs and persistent storage contain neither the audio, nor the file
  name, nor the transcript;
- the logs contain no prayer answers, tokens or full network payloads;
- the system description of the microphone permission matches its actual use.

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
