# Manual checks before a release

This file is the complement of the automated runs (`npm run typecheck`,
`npm test`, the Maestro tier runs `npm run test:e2e:critical|main|rare`, the
ordered suites and the wrapper scripts in `testing/e2e/`). Use it at the
moment a green summary is tempting to read as "the app is fully tested".

`TEST_PLAN.md` stays the source of truth for what each scenario means. This
file names IDs and the extra step a person must still do. It does not copy the
plan texts.

## What a green automated run proves

A green run means, and only means:

- `npm run typecheck` and the unit tests (`npm test`) finished clean;
- every Maestro flow tagged `critical` / `main` / `rare` passed on the iOS
  Simulator (`Pray Smoke iPhone 17 Pro`, locale `ru_RU` unless a flow says
  otherwise) — that is what `npm run test:e2e:critical|main|rare` selects;
- each ordered suite passed whole: `ios-lock-suite.yaml`,
  `ios-lock-006-suite.yaml`, `ios-jrn-suite.yaml`, `ios-background-suite.yaml`
  and `ios-rem-editor-suite.yaml` (suite members are excluded from the tier
  tags because their order matters, so a tag run alone does not reach them).

It does not prove real microphone audio, a notification that fires in real
time on a phone, a system dialog, a device reboot, airplane
mode, or a server log. It also says nothing about the wrapper-script groups —
`run-lng.sh`, `run-rem-fire.sh`, `run-stub-phase.sh`, `run-lock-*.sh`, `run-ipad.sh` — unless
those were run explicitly, with their prepared environments. See sitting 9.

Of 176 scenario IDs (`TEST_PLAN.md` sections 6–8, `PRE-*` through `LOCK-*`
including `START-*` and `RPT-*`, plus `LNG-001`–`LNG-013`, which the plan does
not catalogue yet and which live in the e2e flows and this file), automation on
main fully covers 107, partially covers 24, and does not cover 45. Section 9
of the plan has no IDs and is outside the count. How the count was made is at
the end of this file.

## How to read an item

Each item is `ID` — what to do / expected outcome / what you need.

A scenario is on this list for one of three reasons. They have different
lifetimes:

| Tag | Meaning |
| --- | --- |
| `impossible` | Cannot be automated in this setup (no real microphone, a reboot, an OS-language system dialog, airplane mode). Stays manual until the setup changes. |
| `deliberate` | Automatable in principle. Will not be automated without a new product decision. |
| `backlog` | Simply not written yet. Named stage, not an excuse. Keep this list small. |

An automated flow that was not run is not coverage: the suites and the wrapper
groups count only when their own documented command was actually executed.

## Owner decision — long transcripts

`ANS-016`, `ANS-017` and `ANS-018` need a ready-made long transcript in the
answer sheet. They stay manual. No debug seed and no test hook will be added
to the product to automate them.

Reason: a shipping build must not grow a test-only surface so that Maestro can
skip a real transcription. Revisit only with a new product decision.

The journal side of the same stories is automated differently:
`ios-jrn-010-011-transcribe.yaml` (JRN-010, JRN-011) and the
`ios-jrn-012a/012b` pair (JRN-012) run under `run-stub-phase.sh`, where the
stub server returns a controlled transcript. The answer-sheet flows above
still need a person because they need a *long* transcript spoken into the UI.

---

## 1. Physical iPhone — microphone and real audio

Need: `npm run iphone`, microphone allowed, a quiet room. About 50 minutes.
Tag: `impossible` — the simulator has no real microphone and no real audio
session interruptions.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| ANS-004 | Deny the microphone in Settings, then open Record. | No crash; the rest of the answer still works. | Settings app |
| ANS-005 | Record one clip; play, pause, resume, let it end, play again. | Non-zero duration; pause keeps the place; replay starts at zero. Audible. | Ears |
| ANS-006 | Two recordings; switch playback between them. | Different files; the other row resets to zero. Audible. | Ears |
| ANS-007 | Save while a recording is still running. | The recording stops and is saved. | — |
| ANS-008 | Delete a recording, confirm, save, reopen. | Gone from the UI, SQLite and `Documents/ExpoAudio`. | Files app / a container dump if you want the files |
| ANS-009 | During a recording, swipe the sheet or tap the backdrop. | Sheet stays; mic stays under "Done"; after stop it closes as usual. | — |
| ANS-010 | Let the timer hit zero with the answer sheet open. | Non-interactive notice; text and recording continue; after save, reflection in one second. | — |
| ANS-011 | Edit an old text answer after switching questions. | The text lands on the question you edited. | — |
| ANS-019 | On an empty answer, tap Record again while it is starting. | One start; no hidden recording. | — |
| ANS-020 | Double-tap "Done" while a recording is stopping. | One file; no save error. | — |
| ANS-021 | Music on; save audio on Q1; record on Q2 at once. | Both play; no "recording was not saved". | Ears |
| ANS-026 | Interrupt a recording (a call, Siri, or a media-services reset). | False overlay gone; next recording starts clean. | A call or Control Centre |
| ANS-027 | Quiet speech with pauses ≥ 4 s. | Valid audible M4A, regardless of AAC bitrate. | Ears |
| ANS-028 | Two spoken markers on two questions; save; reopen. | Each question plays its own marker. | Ears |
| ANS-029 | Ten start → stop → play cycles without leaving the app. | Ten valid files; no stuck overlay. | — |
| ANS-030 | Start a recording right after pausing scripture narration or a draft. | Duration matches the speech; playback does not jump to the end. | Ears |
| ANS-031 | Two files; play 2, then 1, then 2. | Each starts at zero and is the right file. | Ears |
| ANS-032 | Open recordings, play/pause, close with the chevron; repeat after opening the keyboard. | Answer field stays usable; closing the answer removes the backdrop; no dark blocked screen. | — |
| SCR-016 | Timer to zero during scripture narration, music on. | Passage finishes; then reflection after one second; both players stop. | Ears |
| SCR-017 | Timer to zero while reading silently in the expanded reader; scroll; close. | Notice does not steal touches; reflection after the reader closes. | — |
| SCR-018 | During the one-second delay: reopen the reader, pause/resume, open an answer, or add time. | Pending finish cancels; extra time resets expiry; completion runs once. | — |

`ANS-005`, `ANS-006`, `ANS-008` and `ANS-028` have a UI flow
(`ios-answer-recordings-persistence.yaml`, tier `main`). What remains here is
the sound, the files on disk, and resume-from-position / replay-after-end.
`ANS-019` has a related double-tap guard in
`ios-answer-recordings-regression.yaml`; the empty-answer race still needs a
person. Unit tests cover the date logic of `SCR-016`–`SCR-018`; they have not
been run on a device (report `2026-09-13-scripture-timer-completion.md`).

---

## 2. Physical iPhone — music by ear

Need: the same Release build, no headphones required. About 20 minutes, or
about 50 if you sit through the whole playlist. Tag: `impossible` for
listening; the tag-run flows only see the `music-playing` chip and the player
state.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| MUS-002 | Airplane mode; turn the music on. | All bundled tracks play. No network. | Airplane mode |
| MUS-003 | Let the playlist run out. | Fifteen tracks, then the loop. | Time (~45 min of audio) |
| MUS-004 | Background the app with music on; come back. | Matches the current product policy; write down any divergence. | Ears |
| MUS-005 | Music on; record a voice answer; play the draft. | Music ducks for record/play and is absent from the file. | Ears |
| MUS-008 | Start several prayers in a row. | The opening track is random and does not repeat the previous start in this launch. | Ears |

`MUS-001`, `MUS-006` and `MUS-007` are in the tier tag runs as UI
(`ios-music-toggle.yaml`, `ios-music-finish-early.yaml`,
`ios-music-timer-finish.yaml`). Still listen once that finish (manual or on
expiry) is actually silent on reflection. `MUS-004` has the pause/resume state
asserted by `ios-background-suite.yaml`; the audible part stays here. The
random-start logic of `MUS-008` has a unit test (`musicOrder.test.mjs`); the
audible variety across starts does not.

`MUS-004` in the plan says the music pauses in the background. The
`2026-08-29-background-timer-music` report describes a native media session
that keeps playing. Confirm the policy before you fail the check.

---

## 3. Physical iPhone — reminders on a real phone

Need: notifications allowed, willingness to reboot. About 15 minutes of
tapping plus waiting. Tag: `impossible` for reboot and the tap-through.

Most of the reminder block is automated on the simulator:
`run-rem-fire.sh` drives `ios-rem-001-permission-allow.yaml`,
`ios-rem-fire.yaml`, `ios-rem-005-two-times.yaml`,
`ios-rem-006-restart.yaml` and `ios-rem-008-toggle-off.yaml` — it sets a time
a minute or two ahead through `gen-rem-set-time.mjs` and waits for the real
scheduled fire (REM-001, REM-004, REM-005, REM-006, REM-008, REM-011,
REM-013). `ios-rem-002-permission-deny.yaml` (REM-002) carries the same
`reminders` tag. `ios-rem-editor-suite.yaml` covers REM-014 and REM-015
(two-tap delete, timeout, edit and re-arm reset). What remains manual is the
phone itself:

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| REM-003 | Deny, then grant in Settings, return to Lampada. | Schedule appears without restarting the app. | Settings app |
| REM-007 | Reboot the phone; wait for the next slot. | The reminder still arrives. | Device reboot |
| REM-009 | Tap a notification from Home or from the journal. | Home opens. Failed on the simulator on 2026-09-02: the tap never reached the app. Do this on an unlocked phone. | Notification Centre |
| REM-010 | Tap a notification during an ongoing prayer. | The session is not interrupted. | A live prayer |
| REM-012 | A reminder while the prayer timer is running. | The ongoing chronometer (ADR-0010) stays; it is not replaced. | A live timer |

Worth one extra minute on the phone even though the simulator covers it: a
notification that really arrives (REM-004) and a banner while the app is open
(REM-011). The simulator run proves scheduling; the phone proves delivery.

---

## 4. Physical iPhone — system Settings and biometrics

Need: Face ID or Touch ID enrolled. About 10 minutes. Tag: `impossible` for
the OS-language dialog.

The lock block itself is automated on the simulator: the suites
(`ios-lock-suite.yaml`, `ios-lock-006-suite.yaml`) cover LOCK-001…007, and the
wrapper scripts cover the rest — `run-lock-appswitcher.sh` (LOCK-008, the
task-switcher privacy curtain), `run-lock-biometrics.sh` (LOCK-009, LOCK-010
via BiometricKit signals), `run-lock-storage-check.sh` (LOCK-011, PIN entry
while the script greps the device log and inspects the Keychain). Run them on
a phone once if you want the enrolled-hardware proof; the simulator run is the
coverage.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| LNG-013 | Change the in-app language, then trigger any OS permission dialog. | The system dialog and the app display name follow the OS app language, not the in-app selector. | Settings → Lampada language |

---

## 5. Airplane mode and a broken network

Need: a phone or the simulator, Airplane mode or a proxy you control. About
20 minutes. Tag: `impossible` without network control.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| ANS-014 | Transcribe offline, with a timeout, and with an HTTP error. | Audio stays; "Retry" works; a later attempt can succeed. | Airplane mode, then a working network |
| AI-001 | A build with the AI variables missing. | Local questions; the main flow works. | A build without `EXPO_PUBLIC_*` (do not print the values) |
| AI-003 | Offline / 4xx / 5xx / invalid JSON on a question. | Visible backup question; no endless spinner. The tag runs hit the timeout and the HTTP-error path only. | Airplane mode or a broken proxy |
| AI-009 | Finish with a fast, a slow and an unavailable AI. | Closing question 15 s before zero; a pending one shows a loader, not a premature fallback. | A slow or dead proxy |
| SCR-010 | Open Scripture settings offline or with a catalogue error. | Saved labels stay; retry is offered; the triple is not damaged. | Airplane mode |
| SCR-011 | Switch language or translation while an offline cache exists. | No snapshot from another language/translation. | Airplane mode after using two triples |
| SCR-020 | Launch and page Scripture with no network. | At most seven recent compatible passages; empty cache → a neutral error and retry. | Airplane mode |
| SCR-021 | Restore the network on an offline passage; press its retry label. | A fresh server passage; the app does not walk the saved history first. | Toggle Airplane mode mid-session |

`ANS-012` (UI: card + "Transcribe", no spinner) is automated in
`ios-stage04-ans-012-no-transcribe.yaml`. That no request and no tokens were
spent is only visible in the proxy or server log — see sitting 7.

---

## 6. A ready-made long transcript

Need: speak a long answer so the proxy returns a real transcript. About
10 minutes. Tag: `deliberate` — see the owner decision above.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| ANS-016 | Open a long transcript in the recordings sheet. | Three lines; "Show in full" expands and collapses; the list still scrolls. | A long successful transcript |
| ANS-017 | "Add to the answer" on an empty field and on a filled one. | Sheet closes; text appended after a blank line; the transcript itself unchanged. | Same |
| ANS-018 | Inspect the transcript, save, reopen. | Expand/collapse and "Add to the answer"; no separate delete; audio and text still there. | Same |

The journal transcription paths are automated under `run-stub-phase.sh`:
`ios-jrn-010-011-transcribe.yaml` (loading → transcript → reopen → search by a
transcript word, JRN-010/JRN-011), `ios-jrn-012a/012b` (error, then retry,
JRN-012) and `ios-jrn-013a/013b` (close or delete during transcription,
JRN-013). `ANS-013` and `ANS-015` have their UI slices automated
(`ios-stage04-ans-013-save-in-flight.yaml`,
`ios-stage04-ans-015-delete-during.yaml`); that a late live response stays out
of SQLite is only proven against a slow proxy — the stub phase covers it for
the journal, this sitting covers it for the answer sheet if the proxy is slow
enough, otherwise sitting 7.

---

## 7. Privacy, logs and the HTTP body

Need: the Mac that built the app, optional access to the AI / Scripture proxy
logs. About 15 minutes. Mix of `impossible` (Maestro cannot read an HTTP body
or a server log) and static inspection.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| LNG-010 | A missing catalogue key, or an About contact with no string in the current language. | English, then the key; About contacts fall back to English, then Russian. Scripture and user-typed text are not translated. | Cannot be injected without a hook — `deliberate` / `impossible` |
| LNG-011 | Allow core AI; start a prayer after choosing `en` / `ru` / `uk`. | Every question request carries `default_language` equal to the current interface language; a switch does not reuse a question prepared for another language. | A proxy log or a MITM of the request. Maestro cannot see the body. (`ios-lng-009-fallback-questions.yaml` covers the fallback-questions slice.) |
| LNG-012 | Save an answer (or finish a prayer with a typed topic), then switch the interface language. | Stored user text and already shown questions stay in the language they arrived in. | The setup-draft path is unreachable: leaving setup clears the draft (`NAV-002`). Use a finished prayer or an answer already in the journal. |
| ANS-012 | After the automated "do not press Transcribe" path, read the proxy. | No request, no tokens. | Proxy / server log |
| AI-005 / SCR-005 | Core AI denied; request a passage. | `topic` and `user_replies` absent. `ios-scripture-context-privacy.yaml` is in the `critical` tier and the privacy stub returns 422 if a reply leaks; the proxy log is the independent proof. | Proxy log, or the stub with `SCRIPTURE_STUB_MODE=privacy` |
| Section 9, security | Grep the Release bundle and the client logs. | No Google / server master key; no answers, tokens or full payloads in client logs; audio reaches the transcription URL only after an explicit press and consent. | The built `.app` and a session log. Do not print secret values. |

`LOCK-011` used to live here; `run-lock-storage-check.sh` now greps the device
log and inspects the Keychain during PIN entry on the simulator.

---

## 8. iPad, rotation, keyboard, VoiceOver — stage 07

Need: an iPad (or the iPad simulator), an iPhone SE, VoiceOver. About
40 minutes. Tag: `backlog` of stage 07, ClickUp `86cb8k53f`. These are not
gaps in stage 09. They are still a human sitting before a release that claims
tablets or accessibility.

| ID | Do | Expected | Need |
| --- | --- | --- | --- |
| NAV-008 | Rotate Home and one other screen while JS is busy. | The background covers the canvas; no strip keeps the old size. Plain rotation is automated (`ios-ipad-nav-008-rotation.yaml`); look at its landscape screenshots. | iPad |
| SETUP-004 | Long goal; tap above the field and in both tablet margins. | Outside taps dismiss the keyboard without losing text; "Next" works after it closes. The phone half (long goal reaches the session) is automated in `ios-stage03-long-goal.yaml`. | iPad |
| ANS-023 | Look at the `ANS-023-*` screenshots from the three devices. | A margin remains between the buttons and the screen edge. Visibility and taps are automated (`ios-ans-023-recordings-actions.yaml`). | Three sizes |
| ANS-025 | VoiceOver on a short and a long transcript. | Full text; a short one is not a button; "Show in full" is its own focus. | VoiceOver + a transcript from sitting 6 |
| SCR-025 | Look at `SCR-025-reader-expanded` from the `main` run. | Title and buttons below the status bar. Visibility and taps are automated (`ios-scr-025-reader-dynamic-island.yaml`). | iPhone with a Dynamic Island |
| Section 9, UI | 320–430 pt widths; enlarged Dynamic Type; Reduce Motion; contrast of toggles and delete confirms; tap targets. | Nothing important clipped; labels present. | SE + a Pro + iPad |

---

## 9. Groups the tag runs do not cover

These flows exist and are automated, but a green `test:e2e:critical|main|rare`
summary does not include them: they need a wrapper script, a prepared
environment, or an explicit ordered run. Tag: prepared environment, not "not
written". Do this sitting only when you want those IDs, not because the tier
summary was green.

| Group | Command | IDs / flows |
| --- | --- | --- |
| Interface language | `bash testing/e2e/run-lng.sh` (switches the simulator locale between flows) | LNG-001…009 (`ios-lng-*.yaml`; they carry a `NEEDS-RUNNER` comment and are not in the tier tags) |
| Reminder firing | `bash testing/e2e/run-rem-fire.sh` | REM-001, REM-004, REM-005, REM-006, REM-008, REM-011, REM-013 |
| Reminder editor | `maestro test testing/e2e/ios-rem-editor-suite.yaml` | REM-014, REM-015 |
| iPad | `npm run test:e2e:ipad` (one booted iPad simulator, or `UDID=`) | NAV-008 (partial), START-005, ANS-033, END-006, ANS-023 (`ios-ipad-*.yaml` + `ios-ans-023-recordings-actions.yaml`) |
| Lock suites | `maestro test testing/e2e/ios-lock-suite.yaml`, `ios-lock-006-suite.yaml` | LOCK-001…007 |
| Background music at the deadline | `bash testing/e2e/run-background-music-timer-end.sh` (checks the player stop in the simulator audio log) | MUS-009 |
| Lock wrappers | `run-lock-appswitcher.sh`, `run-lock-biometrics.sh`, `run-lock-storage-check.sh` | LOCK-008, LOCK-009, LOCK-010, LOCK-011 |
| Journal / background suites | `maestro test testing/e2e/ios-jrn-suite.yaml`, `ios-background-suite.yaml` | JRN-001…005, JRN-007, JRN-014, END-003/004 (with answers), SES-004, MUS-004 |
| Stub phase | `bash testing/e2e/run-stub-phase.sh` (needs the build with `EXPO_PUBLIC_API_URL=http://localhost:9085` + `EXPO_PUBLIC_FORCE_SESSION_ERROR=1` and `npm run scripture:stub`; see `testing/README.md`) | START-004 (`ios-stage03-start-sqlite-lock.yaml`), SCR-001, SCR-002 (`ios-stage06-scr-001-navigation.yaml`, `ios-stage06-scr-002a-favorite-relaunch.yaml` /
  `ios-stage06-scr-002b-favorite-relaunch.yaml`), JRN-010…013, the delayed-AI pair (`ios-stage05-ai-late-stub.yaml` + the `ios-stage05-ai-late-response.yaml` fragment, AI-004/AI-008), RPT-001…003 (`ios-rpt-001-002.yaml`, `ios-rpt-003.yaml`), plus the non-plan checks `ios-update-soft.yaml`, `ios-update-hard.yaml` and `ios-scripture-legacy-favorites.yaml` (seeded by `seed-legacy-favorites.sh`) |

Notes:

- The stub-backed scripture flows `ios-scripture-context-privacy.yaml`
  (`critical`), `ios-scripture-context-fallback.yaml`,
  `ios-scripture-context-main.yaml` and `ios-scripture-highlight.yaml`
  (`main`) sit inside the tier tags, but their deterministic assertions assume
  the stub setup from `testing/README.md`; against a live server they prove
  only the happy path.
- `JRN-006` (`ios-stage06-jrn-006-audio-switch.yaml`) needs its recordings
  seeded by hand; `JRN-009` (`ios-stage06-jrn-009-missing-file.yaml`) needs a
  recording file deleted from the container. Both flows are written; the
  preparation is yours.
- `SCR-023` (`history_reset: true`) still has no flow — feed the app such a
  response from the stub or catch a live case.
- `RPT-004` is a negative check (no report action in the saved journal) and
  has no flow; one glance at the journal after sitting 6 covers it.
- `ios-stage06-scr-002-favorite-relaunch.yaml` is superseded by the
  `002a/002b` pair in the stub phase and runs nowhere on its own.

---

## 10. Not written yet

Automatable on the current simulator, no product hook required. Backlog, not
a substitute for the sittings above.

| ID | Gap | Stage |
| --- | --- | --- |
| ANS-002 | Close an empty answer sheet; no confirmation. Cheap Maestro. | 09, `86cbj8a3j` |
| SETUP-003 | The `±` buttons on setup (the 5/15/30/60/∞ presets are already automated). | 09 |
| START-003 | Repeated hold gestures during the threshold transition; no parallel sessions. | 09 |
| AI-012 | Withdraw each allowed AI purpose in Settings, then use that feature at once. | 09 |
| SES-005 | Finish early with an unsaved answer sheet still open (finish-early without an open sheet is automated). | 09 |
| START-001 | Move the finger off the hold control (a short hold is already automated). | 09 |

iPad, rotation and keyboard are not listed here — they are sitting 8,
stage 07 (`86cb8k53f`).

---

## 11. Outside this iOS run

Recorded so a green iOS summary is not mistaken for these:

- **Android** — `NAV-004` (system Back), TalkBack, the Android reminder
  channel. The plan already parks this on the next-platform run.
- **`NAV-006`, `NAV-007`, `END-005`** — Home / streak across a later day,
  local midnight and a DST transition. Unit tests already cover the date
  logic (`homeRefresh`, `streak`). A live midnight on a phone is optional
  theatre, not a missing proof of the arithmetic.
- **`PRE-001`, `PRE-003`, `PRE-004`** — install from the lockfile,
  `npx expo-doctor` (no npm wrapper; run it by hand and keep the log), and a
  supported Release build. `PRE-002` is the only automated one:
  `npm run typecheck`.
- **Section 9 reliability** — memory after ten sheet openings, a system
  call during a prayer, leftover mic / player after leaving a screen. Cold
  start without a white screen is sampled by every `clearState` flow; stutter
  and memory are still eyes and Instruments on a phone.

---

## Suggested order on a release morning

1. Confirm the tier runs, the suites and the unit/typecheck gates are green —
   and that you are reading this file, not stopping there.
2. Sitting 1 (microphone) and sitting 2 (music) on the Release iPhone —
   one install, one sitting, about an hour.
3. Sitting 3 (reminders on the phone): set a time two minutes ahead, then do
   sitting 4 (the OS-language dialog) while you wait; reboot at the end.
4. Sitting 5 (Airplane mode) and sitting 6 (one long spoken transcript →
   the answer sheet).
5. Sitting 7 (logs) on the Mac.
6. Sitting 8 only if this release claims iPad or accessibility.
7. Sitting 9 for every scripted group whose IDs you want to claim: the stub
   phase, the LNG runner, the reminder driver and the lock wrappers.

Rough total for the iPhone-only release path (sittings 1–7): **about two
hours**, plus however long you choose to wait for `MUS-003` and the reminder
slots.

---

## How the 176 IDs were counted

Every `PRE-*`, `SMK-*`, `NAV-*`, `SETUP-*`, `START-*`, `SES-*`, `MUS-*`,
`ANS-*`, `AI-*`, `SCR-*`, `RPT-*`, `END-*`, `JRN-*`, `REM-*` and `LOCK-*` row
in `TEST_PLAN.md` sections 6–8 (163 IDs), plus `LNG-001`–`LNG-013` (13 IDs)
which the plan has no section for yet — they are catalogued by the
`ios-lng-*.yaml` flows and this file. Section 9 of the plan has no IDs and is
not in the 176.

- **Covered (107):** a flow asserts the outcome the plan names and runs in one
  of the automated paths on main: a tier tag run (`critical` / `main` /
  `rare`), an ordered suite, or a committed wrapper script (`run-lng.sh`,
  `run-rem-fire.sh`, `run-stub-phase.sh`, `run-lock-*.sh`, `run-ipad.sh`). For `PRE-002` the
  run is `npm run typecheck`; for `NAV-006`, `NAV-007` and `END-005` the unit
  tests of the date arithmetic count, because the live-midnight pass is
  documented above as optional. Covered IDs whose only automation is a suite
  or a wrapper are not proven by the tier runs alone — sitting 9 names them.
- **Partial (24):** an automated flow asserts a slice (usually UI, or the unit
  tests of the logic) and the rest is in this file.
- **Not covered (45):** no flow at all (physical-device, airplane-mode,
  backlog and deliberate items), a flow whose preparation is manual
  (`JRN-006`, `JRN-009`), or a documented negative check (`RPT-004`).

Flow file names are not always the current plan ID (`ios-stage06-scr-002a/b`
is today's `SCR-003` favourites story; `ios-stage06-scr-003-long-reader` is
today's `SCR-004`; `ios-stage06-scr-003-small-reader` is the SE half of
`SCR-025`). The count follows the plan IDs and what the YAML actually does.
