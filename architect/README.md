# Lampada architecture

This document is a short source of truth about the current shape of the app. It
describes only what is implemented. The reasons behind significant decisions are
kept separately in [`decisions/`](decisions/README.md).

## Purpose

Lampada is a mobile app for personal Christian prayer. The user sets the topic
themselves, and the app helps them pray with intent and keep their focus: it asks
guiding questions and picks scripture passages by meaning. Text or voice answers
and the final takeaway can be saved, to come back to them later in the journal.

The main user flow:

`Home -> Setup -> Threshold -> Session -> Reflect -> Done`

The journal and the settings are separate branches off Home.

While Home is focused, its prayer calendar refreshes on app activation and at
the next local midnight. Leaving Home removes the listener and timer; resuming
the app refreshes the calendar without resetting the session.

Screen backgrounds fill the entire Skia canvas. Gradient geometry follows the
canvas size on the UI thread so rotation does not wait for JavaScript updates.
The flame's Reanimated clock stops when its route is covered or the app leaves
the active state and restarts when exposed, avoiding hidden Skia path creation.
The Skia halo behind the session timer is memoized and pauses its breathing
while a sheet or a report dialog is open or the session is covered: its scene
updates took frames from the text input, and typing showed up in batches.

## Technology outline

- Expo SDK 57, React Native 0.86 and React 19.
- TypeScript 6.
- Expo Router with file-based routing in `app/`.
- Zustand for the session state and the settings.
- Expo SQLite for persistent structured data.
- Expo File System and Expo Audio for local voice recordings, the bundled music
  and the streamed scripture narration.
- Expo Widgets and Expo UI for the system countdown in an iOS Live Activity.
- A local Expo Module in Kotlin for the Android system countdown notification.
- Expo Notifications for scheduled local prayer reminders.
- Expo Secure Store, Expo Local Authentication and Expo Crypto for the optional
  app lock with a PIN and biometrics.
- Expo Localization for initial interface and scripture language selection.
- Expo Splash Screen for the launch screen: the app background `#0e0a07` with
  the flame from `assets/splash.png` on both platforms. The root layout's
  first frame is an identical copy (`components/BootSplash.tsx`). The native
  splash is hidden once the copy's flame has loaded. The app mounts when fonts
  and the interface language are loaded and Android has finished taking over
  the system splash (`modules/splash-hand-over`, Android 12+); the copy fades
  out over it. A font loading error is fatal: the root layout exports no error
  boundary, so the app crashes with a crash report (ADR-0040).
- Reanimated 4.5.5, Gesture Handler and Skia for animations, gestures and graphics.
- A custom native build: Expo Go does not support all the native modules in use.

The Android build plugin permits cleartext traffic only when the build
channel is `test` and its API origin uses HTTP. HTTPS builds disable cleartext;
an HTTP origin without the test channel fails native configuration explicitly.
It also reserves a 4 GiB Gradle heap and 1 GiB metaspace for the Release DEX merge.
The manifest records the build channel and normalized API origin without the
client key. Android e2e reads these fields from the installed APK before launching
the app or clearing its data and requires a test channel with the expected
non-production origin.

`android.blockedPermissions` removes the template permissions
`SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`:
recordings and the journal stay in app storage and prayers are shared as text.

Changes to the app are made against the documentation of
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) specifically.

Reanimated 4.5.5 fixes stale settled animation properties that can move an open
sheet below the screen while leaving its backdrop visible
([upstream fix](https://github.com/software-mansion/react-native-reanimated/pull/9527)).
This patch supports the project's React Native 0.86 and Worklets 0.10 versions;
upgrading it requires rebuilding the native app.

## Application structure

| Area | Responsibility |
| --- | --- |
| `app/` | Screens and Expo Router navigation |
| `components/` | Reusable visual and interactive components |
| `components/AnswerSheet.tsx` | The text answer sheet and the coordination of the audio recording lifecycle |
| `components/RecordingsSheet.tsx` | A separate sheet for recordings, the player and transcripts, on top of the answer |
| `components/PrivacyConsentDialog.tsx` | The equal-weight first-use disclosure and allow/deny actions for an AI purpose |
| `components/ContentReportDialog.tsx` | Confirmation, optional comment and delivery state for reporting a generated question or selected passage |
| `components/BottomSheet.tsx` | The in-screen bottom sheet used by the settings screen for option lists, the reminder editor and privacy consents; an overlay rather than a system Modal so the privacy screen and lock stay on top |
| `lib/store.ts` | The state and the scenario of a prayer session |
| `lib/db.ts` | SQLite, migrations, the journal, favourites and the streak |
| `lib/ai.ts` | Prompts, validation of the AI response and local degradation |
| `lib/answerSave.ts` | The answer-save order: await the local write, then ask the undecided answer-context consent only on a manual save during the prayer |
| `lib/answerContext.ts` | The composition of the person's replies for the AI: the answer text and the transcripts of its recordings |
| `lib/questionRequest.ts` | Structured question history, stage metadata and request limits |
| `lib/aboutClient.ts` | Contact cards from the shared Bible Garden `/api/about` endpoint, response validation and request cancellation |
| `lib/llm.ts` | The HTTP client of the server-side AI proxy |
| `lib/contentReportClient.ts` | The bounded HTTP client for AI-content reports; it sends no prayer answer or topic |
| `lib/transcription.ts` | Sending a local audio recording for server-side transcription |
| `lib/audioFileDuration.ts`, `lib/recordingFile.ts` | Reading the completed audio file's duration and validating the saved recording |
| `lib/transcriptionLimits.ts`, `lib/transcriptionPreflight.ts`, `lib/transcriptionErrors.ts` | The recording and upload bounds, upload validation and user-facing failure categories |
| `lib/settings.ts` | Privacy settings, interface language, atomic scripture choice, reminder schedule and last prayer duration saves |
| `lib/i18n.ts`, `lib/locales/` | Reactive English, Russian and Ukrainian interface translations |
| `lib/privacyConsent.ts` | The versioned consent record, provider-contract identity and legacy migration rules |
| `lib/lock.ts` | The PIN salt and hash in SecureStore, biometrics, the lock state and the full data wipe |
| `lib/prayerDuration.ts` | The prayer duration bounds, the default and the strict parsing of the stored last duration |
| `lib/prayerReminders.ts` | The pure model of the reminder schedule: validation, WEEKLY triggers, the human-readable line, the phrase pool |
| `lib/prayerReminderScheduler.ts` | The channel, the permission and the full rescheduling of local reminders through expo-notifications |
| `lib/scripture.ts` | The types of the scripture contract, the request builder and the display model |
| `lib/scriptureClient.ts` | The HTTP client of the contextual selection and the controlled retries |
| `lib/scriptureAudioClient.ts` | Book aliases, verse-level timings and the public URLs of chapter audio |
| `lib/useScriptureAudio.ts` | The player lifecycle for the selected passage and the temporary audio focus |
| `lib/audioModeCoordinator.ts` | The single queue of the global Expo audio mode, the priority recording lease and reference-counted audio-session leases |
| `lib/audioPlayerOperation.ts` | The draft player's readiness, stale-play cancellation, audio-session lease and native status-listener lifecycle |
| `lib/audioCueOperation.ts` | A bounded, cancellable recording-limit cue with native status cleanup |
| `lib/recordingOperation.ts` | The single-flight lifecycle of starting, stopping and interrupting a voice recording |
| `lib/recordingLimitController.ts` | The single stop decision from the recorder's accumulated recorded milliseconds |
| `lib/useRecordingLimit.ts` | The mounted recording-limit lifecycle: polling, per-recording reset, guarded manual stop, UI state and terminal failure reporting |
| `lib/scriptureAudioOperation.ts` | Invalidation of late narration continuations on stop and on a change of scripture context |
| `lib/useSheetReflow.ts` | Rebuilding a sheet for the new window geometry |
| `lib/scriptureCatalogClient.ts` | The HTTP client of languages, translations and available narrations |
| `lib/scripturePreferences.ts` | The valid dependent triple of language, translation and narration |
| `lib/scriptureRepository.ts` | History, the cache, book names and favourite snapshots in SQLite |
| `lib/scriptures.ts` | The old catalogue, used only by the lossless migration of favourites |
| `lib/music.ts` | The catalogue of the bundled CC0 pieces and the static audio assets |
| `lib/musicOrder.ts` | The pure logic of a random starting track without repeats between sessions |
| `lib/prayerSystemTimer.*.ts` | The platform lifecycle of the timer on the locked screen |
| `widgets/PrayerLiveActivity.tsx` | The iOS Live Activity and Dynamic Island with the system countdown |
| `modules/prayer-timer-notification/` | The Android ongoing notification with the system chronometer |
| `modules/splash-hand-over/`, `lib/splashHandOver.*.ts` | The end of the Android 12+ system splash hand-over, before which the root layout does not mount the app (ADR-0040) |
| `lib/disableFontScaling.tsx` | Turns off system font scaling for every `Text` and `TextInput`; imported first in `app/_layout.tsx` (ADR-0032) |
| `lib/theme.ts` | Visual tokens, `useStyles` - rebuilding the styles when the window geometry changes (ADR-0011), `column()` - the content column of the single layout (ADR-0012) |
| `assets/audio/` | The local music files and the record of their origin and licenses |
| `testing/` | Scenarios, Maestro flows, reports and final evidence |
| `store/` | App Store screenshots and preview videos |

Shared SVG icons accept prototype sizes and apply `sc()` internally; callers
pass unscaled values. Text size depends only on window geometry: the system
font size (iOS Dynamic Type, Android font scale) is ignored (ADR-0032). Settings sheets are centered and capped at `sc(390)` in
width to keep their controls compact on wide tablet windows.

Accessibility baseline. Text tokens in `lib/theme.ts` (including
`placeholder`) meet WCAG AA 4.5:1 on the lightest backgrounds they sit on - a
`cardBg` card over `bgScreen` or `bgSheet`; screens use tokens rather than their
own translucent text colors. Controls smaller than 44 pt (sizes scale with
`sc()`, so `sc(32)` is 41 pt on an iPhone SE) extend their touch area with
`touchSlop(size)` from `lib/theme.ts` instead of growing visually. Reduce Motion
relies on Reanimated's default `ReduceMotion.System`: entering/exiting
animations are skipped and `withRepeat` loops (flame, halos, recording wave)
freeze; Reanimated reads the setting at app start. The hold-to-start ring opts
out with `ReduceMotion.Never` because it is progress feedback.

Setup's Next action is disabled during the initial 350 ms Stack transition.
This prevents a repeated Home press from passing through to the primary action
at the same screen position. Home and Setup use idempotent navigation to avoid
stacking duplicate Setup or Threshold routes.

On Android, the lock gate and privacy curtain occupy a native modal window.
This excludes relocated native-stack screens from TalkBack while locked; a
React Native wrapper's accessibility flag alone does not cover that hierarchy.
iOS keeps the root overlay with modal accessibility semantics.

Screen readers. Under Fabric iOS a VoiceOver double tap reaches JS only through
`onAccessibilityTap`, and adjustable swipes reach `onAccessibilityAction` by the
`adjustable` role alone; TalkBack knows only declared `accessibilityActions`.
So the hold-to-start button starts the session at once on `onAccessibilityTap`
(iOS) and the `activate` action (Android), and the step dots (`WindowDots`)
declare `increment`/`decrement` only on Android - on iOS declared actions would
show up as extra untranslated items in the Actions rotor. Transient notices
(prayer saved, time is up over an open sheet) and two-step confirmations
(cancel a draft answer, delete a journal entry) are spoken through
`AccessibilityInfo.announceForAccessibility`: neither `accessibilityRole="alert"`
nor a live region announces a view reliably on both platforms. Every dialog
closes with the VoiceOver escape gesture (`onAccessibilityEscape`) as well as
Android back. `IconButton` requires `accessibilityLabel`.

Keyboard dismissal covers the screen or sheet bounds independently of the
centered text column. Text fields retain their own touch handling; the answer
sheet's side margins and handle dismiss the keyboard without discarding drafts.
Opening voice recordings blurs the answer input and disables editing while the
recordings sheet covers it. Closing recordings restores editing with the draft
text intact, so the covered input cannot keep or regain Android keyboard focus.
The critical Android tier and individual Android flows share
`scripts/test-android.sh`, which validates the installed Release APK's test
channel and API origin before invoking Maestro.

## Screens and navigation

Home enters `/setup` with `router.navigate`, so repeated Start presses reuse
the setup route rather than adding duplicate entries to the back stack.

| Route | Role |
| --- | --- |
| `/` | Home, the streak and the entry points into the main sections |
| `/setup` | The prayer topic and the duration |
| `/threshold` | Preparing to start the session and generating the question in advance |
| `/session` | The timer, the questions, the answers and scripture |
| `/reflect` | The closing question and the wording of the takeaway |
| `/done` | Compatibility redirect to Home for older links |
| `/journal` | Prayer history, search, playback, saved quotes and deletion |
| `/settings` | Settings for the language, the translation, the narration, privacy, reminders and the lock |
| `/favorites` | Saved quotes: the key verses, expandable into the full passage |
| `/about` | The point of the app, API-backed contacts, the version and the author's other projects |

`session` and `reflect` cannot be left by an accidental system gesture:
the scenario is finished through explicit interface actions.

On landscape tablets, the threshold places its scrollable briefing beside the
hold-to-start control. Portrait and phone windows retain a vertical layout.

Setup keeps its layout while the goal is typed: the header, title and the
input's top edge stay in place, and the input stretches down to just above the
keyboard over the hidden duration and navigation, scrolling long text inside.
Setup updates that layout without a keyboard-triggered layout animation, so
duration and navigation reappear in place when the keyboard closes.
An invisible copy of the goal sizes the input's slot, so the position follows
rotation; while typing it holds the text from when the keyboard opened.
A long goal shrinks the slot to the free space and scrolls inside, so "Next"
stays on screen.
Reflection uses a keyboard-avoiding, scrollable content area. While typing,
the input fills the available space below the question and above the keyboard.
The editing column expands to at most 960 pt on tablets. The decorative header
and completion actions return when the keyboard closes.
Content can scroll when a long question or a small window needs more room.
Both screens follow the keyboard through `lib/useKeyboardTop.ts`; Reflection
retains the keyboard-synchronized layout animation.

## State and the main data flow

`useSession` in `lib/store.ts` is the single model of a running prayer session.
It holds the topic and the timer, the current questions and answers, the
scripture state, the mode of the bottom panel, the reflection takeaway and the
streak.

The session card has one report control beside the Question / Quote switcher.
It snapshots the active question or the full selected passage (reference,
optional title and text) for `ContentReportDialog`; the expanded scripture
reader has no separate report control.

The main flows:

```text
Screen → useSession → lib/db.ts → SQLite / local audio files
                   ↘ lib/ai.ts → lib/llm.ts → bible-api → Google Gemini (paid API)
                               ↘ local curated fallback
                   ↘ lib/transcription.ts → bible-api → Whisper or Google Gemini (paid API)
                   ↘ lib/scriptureClient.ts → bible-api /api/ai/scripture
                                               → Google Gemini + self-hosted bge-m3 search
                                            ↘ lib/scriptureRepository.ts → SQLite
                   ↘ lib/scriptureAudioClient.ts → bible-api /api/excerpt_with_alignment
                                                 ↘ /api/audio/...mp3
                   ↘ lib/contentReportClient.ts → bible-api /api/ai/content-reports
                   ↘ lib/scriptureCatalogClient.ts → bible-api /api/languages
                                                     ↘ /api/translations
```

The AI is not required to go through a prayer. When there is no configuration, or
on a network error, a timeout or a malformed response, `lib/ai.ts` returns a
question from the local pool for a user-requested generation. Background generation
returns no content on failure and does not substitute a local question. Later
questions use a buffer one question ahead;
stale asynchronous results are cut off by keys and tokens. Local-pool questions
carry a visible backup-question label in both the session and reflection screens.

During a session the user can turn on quiet local music. Fifteen bundled CC0
tracks play in a looping queue without a network and keep playing when the app is
backgrounded and the screen is locked. The player registers as a system media
session, and native background playback is enabled by the `expo-audio` config
plugin. The music fades out when the prayer ends: over 3 s at the finite deadline
in the background or on the locked screen, where the transition to reflection
waits for the app to return, and over 0.8 s on that transition otherwise (see
[ADR-0033](decisions/0033-prayer-time-bounds-music-and-day.md)). Voice recording, playback of a
draft and scripture narration take the audio focus temporarily: the music is
paused until the corresponding action finishes, so that it does not leak into a
recording or mix with the user's audio.
The audio mode coordinator also owns the process-wide audio session through
reference-counted leases. Music, narration, draft playback and recording acquire
a lease for their active interval. Pausing the last player or stopping the last
recorder releases it and deactivates AVAudioSession in the serialized native
queue; keeping a screen mounted does not retain the session. An untimed prayer
has no deadline: its music ends on the explicit prayer finish, after the normal
fade, rather than on an invented timer (see
[ADR-0036](decisions/0036-audio-session-leases.md)).
On answer-sheet unmount, Expo Audio may release its native player and recorder
before the sheet's effect cleanup. That cleanup cancels pending cue work and
status listeners and releases leases without calling native audio methods.
Voice notes use mono AAC at 22.05 kHz and 48 kbit/s. The recorder's native
`durationMillis` is polled while recording; one mounted limit hook stops it at 599
recorded seconds, leaving one second for the final AAC frame before the server's
600-second limit. Expo pauses recording in the background, so suspended JS does
not miss recorded time; polling resumes with the same native counter. No native
`forDuration` timer is used. An ignored early stop tap leaves the limit active;
an attempted manual stop that fails also keeps the limit active. A failed
automatic native stop or duration read ends automatic
polling after one attempt, logs the cause and leaves a visible stop control and
error. The UI counts down to the same stop point and plays
a leased, mixing cue with light haptics at the limit. The
stopped file remains a draft even if duration loading fails; zero in the local
recording row explicitly means that its duration is unknown. The displayed
duration is rounded to the nearest second from the decoded file, not from JS
completion latency.
Before transcription, the client reads the file duration again without rounding,
including for older drafts whose stored durations came from the recorder clock. It rejects
files above 14 MiB or recordings longer than 600 seconds without uploading
them. HTTP 413, 429 and 5xx, transport
timeouts, and lost connections have separate retry messages in both the answer
sheet and the journal. Existing recordings retain their original format.
Scripture narration retains its position and continues playback when the screen
is covered or the app is backgrounded. It stops when the user changes the
scripture mode, the passage, or finishes the prayer.

The prayer timer keeps the absolute moments of the start and of the planned end
in the runtime session state. The one-second tick is only needed to update the
interface: the actual `elapsed` and `remaining` are computed from the system
clock every time, so after coming back from the background the timer immediately
catches up with the interval that passed. For a finite prayer `elapsed` stops at
`endsAtMs`: the time after zero is not saved as prayer duration, while extending
the timer or resuming from reflection moves the deadline and so the cap (ADR-0033).
An untimed prayer saves the wall-clock time from its start to the last tick of the
session screen. A session unloaded by the OS is not
restored yet.

Timer expiry waits while the reader or answer sheet is open, or narration is
loading, playing, paused or showing an error. A non-interactive six-second notice
allows the user to finish that activity. Sheet opening is reported before its
animation; closing is reported after the sheet settles and recording cleanup
finishes. Once the active prayer screen has no such activity, reflection opens
after one second. Reopening a sheet, starting narration, extending the timer or
backgrounding cancels the pending transition. Returning from the background
re-evaluates the current state. Manual completion bypasses the delay, saves an
open answer and stops audio; a synchronous guard prevents duplicate completion.
Each deadline is announced once. Extending the timer resets the notice.

Returning from reflection uses `resumeSession`, not `enterSession`: it retains
one session ID, all questions, answers and recordings, the scripture trail and
current positions. A finite prayer gets a fresh interval of the selected duration;
an untimed prayer remains untimed. The original start and cumulative wall-clock
elapsed time are retained, including time on the reflection screen. Late reflection
results are invalidated. A reflection request uses the state at the moment the
prayer ends; a first question that arrives afterwards does not cancel it. Final completion writes to the same journal session.
See [ADR-0027](decisions/0027-resume-current-prayer.md).

After the reflection is saved (or skipped), completion returns directly Home with
`router.dismissTo`, removing the prayer flow from the navigation stack. Home shows
a localized four-second saved notice and the updated flame/day state. The
completed prayer counts for the local calendar day of its start, not the day
"Done" is tapped (ADR-0033). The takeaway
remains in the journal; there is no separate success screen. A consumed route
parameter triggers the notice once. Legacy `/done` links redirect without claiming
a new save. See [ADR-0028](decisions/0028-completion-on-home.md).

For a finite prayer the same `endsAtMs` is handed to a system surface: iOS shows
an `expo-widgets` Live Activity on the Lock Screen and in the Dynamic Island,
Android shows a separate ongoing notification from a local Expo Module. The
SwiftUI timer interval and the Android notification chronometer update the
seconds without background JavaScript. Changing the duration replaces the system
deadline, and finishing or resetting removes the card. An infinite prayer creates
no system card. The media controls of the music stay independent: pausing a track
does not change the prayer deadline.

### Visible work lifecycle

Navigation focus, an active `AppState` and the absence of the PIN, privacy or
update overlay jointly define whether a screen is visible. A sheet also needs
to be open. The session's music, native lock-screen timer, narration and
recording are functional work and retain their separate
lifecycle. A hidden finite session schedules one wakeup at its deadline. It
fires on time while JavaScript runs: under an overlay in the active app, or in
the background while music, narration or recording keeps the app alive. In the
iOS background without such audio JavaScript is suspended: the lock-screen
timer still shows the deadline, and the session expires on the first tick after
the app returns. Reflection waits until the session screen is exposed again.

| Component or work | Hidden condition | Before | After |
| --- | --- | --- | --- |
| Home and reflection `Flame` | App background, another route above it, or the reflection input in an App Store video build | App background and the video input paused it; a covered Home kept animating | The flame runs only on a focused foreground screen; the video input pause still applies |
| Session `TimerHalo`, `MusicPulse`, progress ring, keep-awake | App background, another route, or a sheet or report dialog over the timer/music button | Halo paused under the answer sheet only; the pulse and keep-awake survived hidden screens | Repeating visuals run only while exposed; the ring animation and keep-awake stop when the screen hides |
| `RecordingsSheet` wave, elapsed poll and slow transcription hint | Sheet closed, screen covered, or app background | Recording wave and 250 ms poll depended only on recording state; the hint timer could stay mounted in a closed sheet | All three require an open foreground sheet; recording continues until Done and transcription can finish |
| Session UI tick and deadline | App background, another route or PIN/update overlay | One-second interval kept updating the store and deadline | One-second UI interval runs only while visible; every hidden finite session schedules one deadline wakeup, which ends music on time without navigating under an overlay |
| Music players, crossfade and deadline fade | App background or lock screen | Music continued; crossfade and final fade drove the native players | Music continues as designed, with bounded fade work at track changes and the prayer deadline |
| Scripture, answer draft and journal audio | App background or their screen loses focus | Scripture stopped in the background; draft and journal players followed their own controls | Scripture continues until a user action or prayer completion; draft and journal playback retain their prior controls |
| Home midnight refresh and saved notice | Home route covered or app background | Midnight refresh already stopped on route blur/background; the notice timeout did not | Midnight refresh remains focus scoped; the notice timeout pauses while Home is hidden |
| Threshold hold feedback | Route covered or app background during a hold | Haptic timeouts and ring animation were cleared only on unmount or gesture finalization | Haptic timeouts and ring animation are canceled when the screen hides |
| Settings permission/biometry listeners and delete confirmation | Settings route covered or app background | Foreground listeners remained mounted behind other routes; deletion timeout cleared on background | Listeners exist only while visible; confirmation clears when visibility ends |
| `ScreenBg`, navigation transitions, lock gate and network request timeouts | Route covered or app background | Static gradient; finite transitions, global privacy listener and bounded request deadlines | Same finite or global behavior; none has a frame or polling loop |

The main scripture selection is done by the server with AI, by the meaning of the
prayer topic and of the person's replies that the setting allows, not by keyword
match. The first request starts as prefetch on entering the session while the
scripture panel is hidden. If it fails, the panel stays idle with no error or
cached substitute; opening it requests scripture normally. Opening it during a
pending failed prefetch also triggers one ordinary request. After the first
display exactly one prefetch is kept alive. No more than one
selection request runs at a time. `source: retrieval_fallback` and
`source: safe_pool` count as successful responses. The navigation trail contains
only the passages that were actually shown and lives within the current session;
the app walks back along it without a network. The stable `canonical_id` is used
for exclusions and favourites, but the user-facing reference is always built from
the `passage` coordinates of the chosen translation. A failed selection keeps the
current trail and appends compatible saved snapshots only while the trail has
fewer than seven entries. The offline label retries the server immediately, so a
transient failure does not trap navigation behind the full persistent history.
When `passage.verses` is
present, the text is assembled from the structured verses, and the
`highlight.passage` range defines the key verses in the numbering of the chosen
translation. The compact card and the key verses in the full reader use the same
off-white text colour. Surrounding verses use that colour at 55% opacity; passages
without a key-verse range stay at full opacity. The shared passage renderer also
applies this hierarchy in favourites and the journal, with a translucent white
underline for the currently narrated verse. The full reader is opened both by
tapping the card text itself and by the "Read in full" link - both available when
the card truncates the text and when it
shows only the highlighted fragment. If there is no highlight, or it covers the
whole passage, the card shows the passage in full. The client uses the
verse-level representation only when it reconstructs `passage.text` exactly; old
snapshots without the array and inconsistent responses are displayed as the
previous solid text, without heuristics.

For narration the client requests the server `begin`/`end` of the verses, streams
the Range-compatible MP3 of the whole chapter, starts at the first verse of the
passage and stops at the end of the last one. The text selection does not depend
on that extra request; the offline snapshot stays available without audio
controls. In the full reader the current verse is determined by the same timings
and marked with a light dotted underline; during the pause between verses the
mark switches once, in the middle of it, and the compact card does not show this
mark.

The settings screen loads the languages from `/api/languages`, and the active
translations with their narrations from `/api/translations`. The choice is
cascading: changing the language clears the translation and the narration,
changing the translation clears the narration. A complete valid triple is saved
automatically after the narration is chosen, as a single JSON value
`meta.scripture_preferences`. The language, the translation and the narration
code are frozen when a prayer session starts: the language and the translation
are used for the selection, and the narration code for requesting the alignment
and the audio of the chosen passage. On a fresh install the primary
`languageCode` of the device is matched against the server language catalogue; if
there is no match, or the catalogue is unavailable, English is used. After the
first save the system locale no longer overrides the choice.

## Prayer reminders

The reminders are entirely local: no push token is requested, and no network is
needed at the moment they fire (ADR-0013). The schedule is a set of
"weekdays x times" rules; several times on the same day are allowed. The model
and its expansion into WEEKLY triggers live in `lib/prayerReminders.ts`,
separately from the way the schedule was defined: right now the settings screen
lets the user assemble several rules with independent sets of days and times, and
this path remains the degradation for when the AI is unavailable. Inside the
model the weekdays are ISO (1 = Monday); they are converted into the
expo-notifications numbering (1 = Sunday) in exactly one place.

Deleting a rule or an individual time follows the journal and recording pattern:
the first tap highlights the trash button, and a second tap within three seconds
confirms deletion. Only one target can be armed. Editing the schedule, closing
the editor or leaving the active app clears the confirmation.

The scheduling is done by `lib/prayerReminderScheduler.ts`: every "day x time"
pair becomes a single WEEKLY trigger, and the repetition is held by the system,
so the schedule survives the app being unloaded and the device rebooting. There
is no partial update - changing the schedule and every app launch perform a full
rescheduling. The rescheduling on launch is needed for rotation: the text is
handed to the system at scheduling time, so the pool of short phrases is
reshuffled on every scheduling. Whether the person prayed on a given day does not
affect the reminders: `prayed_days` takes no part in the schedule.

The notification permission is requested at the moment the user turns the
reminders on themselves. A refusal leaves the toggle off and is shown on the
settings screen as text; anything scheduled is removed. `SCHEDULE_EXACT_ALARM` is
not requested, so the display time is approximate. The reminders use their own
Android channel `prayer_reminders` and are marked with `content.data.kind`: the
scheduler only cancels its own notifications and does not touch the ongoing
chronometer of the prayer timer in the `twinkler_prayer_timer` channel. Tapping a
reminder opens Home, except when the user is inside the prayer scenario - it does
not throw them out of it.

## App lock

The protection is optional and off by default (ADR-0014): until the user turns it
on in the settings, the behaviour of the app does not change. The base method is
a PIN of 4 to 8 digits, with the length chosen by the user. Biometrics is a
separate toggle strictly on top of the PIN. `biometryText` in `lib/lockPolicy.ts`
builds every biometric text: iOS puts Face ID or Touch ID into the shared
templates; Android uses a complete localized phrase per method and names face
or fingerprint only when the system reports exactly one biometric type,
otherwise "biometrics". The toggle is available only
when the sensor exists and a sample is enrolled in the system; the PIN stays the
only fallback way in.

The PIN itself is neither stored nor logged. `lib/lock.ts` keeps a random salt in
SecureStore, `SHA-256(salt + pin)`, the enabled flag, the biometrics flag and the
PIN length; the length is needed by the unlock screen to show the right number of
dots and to validate the input on the last digit. The keys are written with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` and excluded from Android Auto Backup. An
incomplete record and a storage read error are treated as protection being off: a
SecureStore failure must not cut the person off from their own data.

The gate is `components/LockGate.tsx`, a conditional overlay above the `Stack` in
the root `app/_layout.tsx` rather than a separate route: an overlay cannot be
bypassed by navigation, by a deep link or by tapping a reminder. It also holds the
`AppState` subscription. The lock engages on a cold start and on returning from
the background, if at least 60 seconds were spent there; the countdown starts at
the first transition to `background`. On `inactive` and `background` a privacy
screen is shown - the background and the name without any content - so that the
snapshot in the app switcher does not capture the journal. The same screen stands
while the configuration has not been read from SecureStore yet.

The PIN input is `components/PinPad.tsx`: on unlocking the length is known and the
check runs automatically on the last digit, while during setup and change the
user chooses the length and confirms the input with a button. The setup, change
and disable scenarios are shown by the `components/PinPrompt.tsx` overlay above
the settings screen - not by a system Modal, which would cover the privacy screen
itself.

Covering pixels hides the content only from the eyes and from touches, so
overlays and sheets additionally hide it from screen readers. The mark is put on
the subtree being hidden, on both platforms: Android has no modal flag, and on
iOS `accessibilityViewIsModal` hides only siblings of the modal node, while
`@gorhom/bottom-sheet` sheets render as siblings of the screen through a
fragment. So the `Stack` in `app/_layout.tsx` is wrapped in a layout-neutral
`View` subscribed to the lock state, the settings content is marked under its
sheets and the PIN input, and the session content under the answer sheet and the
Scripture reader. A closed gorhom sheet is only translated below the screen and
would stay in the reading order, so its content is marked while closed
(`useSheetReflow` exposes `open`); gorhom backdrops and containers are made
non-accessible because their built-in labels are English. On opening, focus
moves to the sheet's heading (the question, the passage reference). The shared
helper is `lib/a11y.ts`: it sets `accessibilityElementsHidden` and
`importantForAccessibility="no-hide-descendants"` with a permanent
`collapsable={false}`.

A forgotten PIN cannot be recovered. After two explicit confirmations the "Forgot
your PIN?" link performs a full wipe: `wipeLocalData` in `lib/db.ts` deletes the
whole database file through `deleteDatabaseAsync` and removes the audio files of
the recordings, while `wipeEverything` in `lib/lock.ts` additionally cancels the
scheduled reminders, clears the SecureStore keys and resets the in-memory stores.
The schema is recreated by the ordinary migration on the very next access to the
database. Encrypting the data on disk is out of scope: the lock protects against
someone else's eyes in an unlocked phone, not against reading the files around
the app.

## Data storage

The `lampada.db` database is opened through Expo SQLite in WAL mode. The schema is
created and filled in on open.

| Table | Contents |
| --- | --- |
| `sessions` | The start, the topic, the planned and the actual duration, the takeaway |
| `answers` | The questions and the text answers of a session |
| `recordings` | References to local audio files, the duration and the transcript |
| `favorites` | Favourite scripture passages |
| `scripture_cache` | Full server snapshots of passages and the time they were last shown |
| `scripture_history` | The persistent sequence of the `canonical_id`s that were shown |
| `scripture_favorites` | Favourite snapshots with a nullable legacy `canonical_id` and the `session_id` of the prayer the quote was saved in |
| `scripture_books` | A local directory of book names per translation |
| `favorites_legacy_backup` | A copy of the old favourites from before the migration |
| `meta` | Settings and service values, including `prayer_reminders` - the reminder schedule as a single JSON value, and `prayer_minutes` - the duration of the last started prayer (0 = untimed), which `/setup` opens with; saved on the prayer start, so extending the timer does not change it; the default of 10 minutes applies until the first prayer |
| `prayed_days` | The local calendar days of completed prayers, keyed by the prayer start; the streak is computed from them |

A quote is tied to a prayer through `scripture_favorites.session_id`, which is set
at the moment it is saved. For records made before the column existed, the link is
restored once by time: a quote belongs to the prayer in whose interval
`started_at … started_at + elapsed_sec` it was saved. Those that fall into no
interval stay `NULL` - there is nothing to restore the link from. The journal
shows the quotes of a prayer at the end of the expanded card, with the full text
in a popup.

Android Auto Backup carries the journal to a new device through the user's
Google account (ADR-0040). `plugins/withAndroidBackupRules.js` replaces the
rules of `expo-secure-store` (`configureAndroidBackup: false`). The cloud backup
carries only `files/SQLite/` and only end-to-end encrypted, that is with a
screen lock set; recordings in `files/Audio/` go only with a device-to-device
transfer, because the 25 MB cloud quota would stop the whole backup. Android
7–8.1 back up nothing. No rule lists SharedPreferences, so SecureStore never
enters a copy: a restored journal has no app lock until a PIN is set again,
and a journal restored from the cloud has recording rows without audio files.

The audio files live in the document directory of the app. The database stores a
portable URI and the text of the transcript; the URI is resolved against the
current document directory. The transcript is shown in the journal and takes part
in the local search. `getJournalDetail` checks that each file exists; a recording
without its file (an Android cloud restore, a file lost on iOS) keeps its row and
transcript, is marked "Audio is not on this device", cannot be played or
transcribed, and writes `recording_audio_missing` to `lampada-diagnostics.log`.
Play checks the file again, and a player load error ends the playing state with
a visible message and a `recording_playback_failed` record. Deleting a session deletes its answers and recordings, but
does not change the historical day in the streak.

While answering, the text and the voice recordings are split between two sheets
(ADR-0016). `AnswerSheet` holds the answer field, `RecordingsSheet` holds the
audio files and their transcripts. Transcripts can be expanded or appended to
the editable answer; they are removed together with their recording.
On landscape tablets, the question scrolls in a separate column beside the
answer field and actions. While typing, the voice hint is hidden and the field
uses the remaining height above the keyboard.
Within the recordings sheet, pausing retains the loaded audio and its progress;
Play resumes that position. Switching recordings or replaying a completed one
starts from the beginning. Closing the sheet clears the paused selection.
The recording overlay appears once the native recorder confirms `isRecording`.
Its elapsed time (m:ss) polls the recorder's native `durationMillis` every 250 ms.
The saved duration comes from the same clock and is also floored to whole seconds.
VoiceOver reads the elapsed time as the value of the Stop button and does not
announce each second. The Stop button ignores taps for the first 1.5 s against
double taps. It stays at full opacity so recording never looks unstarted.
A transcription running longer than 4 s shows a hint that the window can be closed.
The hint is true because closing the recordings sheet does not abort the request,
and "Save", including the automatic save before reflection, waits for it.
Cancelling the answer and closing a journal card drop the request.
The asynchronous recorder start/stop are
serialized: a pending state immediately blocks a repeated action and the closing
of the upper sheet. The global audio mode is changed only through
`audioModeCoordinator`: while a recording lease is active, the music and the
scripture audio cannot apply a playback mode and natively cut the recording short
on iOS. The background music uses two automatically released `AudioPlayer`s: the
next local track is loaded in advance and starts sounding two seconds before the
end of the current one, with a crossfade of the volumes. During recording,
scripture narration or when the music is turned off, both players are paused in
sync and an unfinished crossfade is reset. When the prayer ends, the crossfade is
reset, the active player fades out on the same curve and then both are paused.

A prayer can leave the device only as plain text and only by an explicit action
of the user (ADR-0029). The "Share" button of an expanded journal card builds the
note in `lib/exportPrayer.ts` - a pure function over the journal entry, its
`getJournalDetail` content and its saved passages - and hands it to the system
share sheet through the built-in `Share.share` of React Native. The note carries
the topic, the start and the duration, the questions with their answers and the
transcripts of the voice recordings, the saved passages, the takeaway and the
app name. Audio files and file URIs are never exported, and the export itself
makes no network request: where the text goes is decided by the share sheet.

There is no continuous synchronisation of user data with a server at the moment.
The scripture cache and the favourites are read entirely locally. The
availability of Bible API is determined by the result of the HTTP request itself,
without a separate preflight check of the network interface. After a network
error, a timeout or exhausted retries the app shows previously shown snapshots of
the chosen language and translation only; on the first offline launch with an
empty cache it offers to retry. The old bundled catalogue is never presented as
the result of a server selection.

## Application updates

`components/UpdateGate.tsx` checks the installed native version once per root
mount through `lib/versionCheck.ts`. The shared API receives `app=lampada`
and `platform=ios|android`; only responses with the same `app` and `platform`
may trigger optional or mandatory update screens, so Android never opens an
App Store URL. The client does not construct store URLs. Web builds skip the
check. The overlay sits above navigation and below `LockGate`, with accessible
content isolation. A failed or unrecognized check leaves the app usable and
writes a `version_check_ignored` record with the reason (`unconfigured`,
`network`, `status` with the HTTP code, `invalid`, `app-mismatch` or
`platform-mismatch`) to the local diagnostics log `lampada-diagnostics.log`.
See ADR 0020 and [ADR-0040](decisions/0040-google-play-release.md).

Required Bible-API contract for `GET /api/version-check` with `app=lampada`:

- `platform` accepts `ios` or `android`; other values are rejected with 422.
  A request without `platform` comes from an iOS build released before
  ADR-0040 and is answered for `ios`. `app=bible-garden` ignores `platform`
  and its response does not change.
- Minimum supported version, latest version, enable switch and store URL are
  configured per platform. Android uses
  `https://play.google.com/store/apps/details?id=app.lampada`, iOS
  `https://apps.apple.com/app/id6806024678`. Each platform's switch stays off
  until its store listing is public.
- The response adds `"platform": "<ios|android>"` for the platform it was
  decided for; `VersionCheckModel` must declare the field, otherwise FastAPI's
  `response_model` drops it. The other fields keep their current meaning.

Until Bible-API returns `platform`, builds containing this client show no
update notices and record `platform-mismatch`. Deploy the Bible-API change
before releasing a store build of this client.

## Shared API configuration

`lib/apiConfig.ts` owns the single `EXPO_PUBLIC_API_URL` origin and endpoint
paths. Question generation, transcription, Scripture selection, language and
translation catalogs, books, aligned audio, About contacts and update checks
and AI-content reports all use this origin. Server-returned audio paths are still rebased onto that
origin. `EXPO_PUBLIC_AI_PROXY_KEY` contains Bible-API's dedicated
`LAMPADA_API_KEY` value, separate from Bible Garden and operations keys. The
owner sets it manually in local `.env.local` and EAS `preview` and `production`
(`development` before use); it is embedded in the build and must not enter git.
Changing it requires a new Release/EAS build and reinstall, or a Metro restart
for Debug.

Only HTTP(S) origins without credentials, a path, query or fragment are valid;
localhost/port origins are supported for development. Missing or malformed
configuration preserves the clients' existing unavailable/fallback behavior.
Build preflight checks both required variables and validates the origin.
Legacy per-endpoint environment variables are ignored. Local and EAS
environments must migrate before a new build; existing bundles keep their
embedded settings. See [ADR-0025](decisions/0025-single-api-origin.md).

## AI and privacy

The app talks to a `bible-api` server endpoint which owns model routing, model
credentials and system prompts. In production, guiding questions and contextual
Scripture selection use Google Gemini through Google's paid API. Current audio
transcription uses Whisper on operator-managed servers; the consent also permits
Google Gemini through Google's paid API as an alternative. Scripture search uses
bge-m3 on operator-managed servers (ADR-0035). Question requests use
`{ topic, stage, messages, skipped_questions?, shown_questions?, default_language?, prefetch? }`
(ADR-0019, ADR-0023, ADR-0030, ADR-0031). The topic is separate from conversation
history; `stage` selects the server's first, next or reflection question prompt.
`lib/questionRequest.ts` pairs each answered question with its human reply in
ascending question-index order. One user message joins typed text and completed
transcripts with newlines. Unanswered questions are omitted from `messages`, and
an empty conversation is valid. Nonempty history ends with a user message.
Immediately before transfer, `completePrayerContent` adds the current
`uiLanguage` as `default_language` (`ru`, `uk` or `en`) for first, next,
replacement and reflection questions. Scripture preferences are independent.
The server uses this default only when prayer-text language is undetermined;
confident language detection keeps priority. The low-level transport also
preserves omitted and `null` values and propagates HTTP 422 without removing
the field or retrying the request. Deploy API support before releasing this client.
The session keeps replaced unanswered questions in memory until reset or a new
prayer. Requests include them in chronological order in `skipped_questions`,
plus currently displayed unanswered questions so the one-ahead prefetch can
avoid them before replacement. Actual answers, including untranscribed voice
recordings, determine whether a question is unanswered before the privacy gate.
Questions in assistant messages are excluded from the skipped list. For `next`
and `reflect`, `shown_questions` carries answered questions absent from both
`messages` and `skipped_questions`, even without answer-context consent. It
includes untranscribed voice answers but no human reply text or recordings.
The client compares every next and reflection
question with all questions shown in the session, including replaced questions
and earlier reflection questions. Comparison folds case and Russian `ё` to `е`,
ignores apostrophe variants and punctuation anywhere, and collapses whitespace.
It treats a local match like `novel: false` even when the server says `true`.
An unanswered replacement stays visible until another explicit tap; after an
answer, the client selects an unseen question from the local pool. A repeat is
allowed only when the server candidate, if available, and every question in the
local pool for the current stage and language have already been shown. The client
then chooses the least recently shown local question, never a more recent one.
The session retains the order of shown questions across replacements, navigation
and continued prayer; a prepared response is checked against it when shown.
First-stage requests never include skipped or shown history. Requests retain at most 40
messages and the newest 10 entries of each question list, each capped at 300 UTF-16 code units.
The total budget is 16,000 UTF-16 code units across topic, messages, skipped and shown
questions. Messages take priority, then skipped questions; older entries are dropped
when space runs out. The latest human reply is never truncated. Pool keys include
questions, answers and skipped context, which also determine `shown_questions`;
navigation-only changes to the session's shown-question order do not discard a prepared slot.
The transport preserves the optional `novel` response flag. A replacement with
`novel: false` leaves the current question visible and retries only on the next
explicit tap. Advancing after an answer, first-question generation and reflection
use a local fallback when the server reports no novel result. Missing `novel`
remains compatible with older servers. Core and answer consent are
rechecked before transfer. Only public Expo variables -
the URL and the limited proxy key - may be embedded into a client build; server
secrets and system instructions are not put into the app.

The session card shows one report flag for its active Question or Quote tab.
Confirmation sends the question text or the selected passage's full reference,
optional title and text, together with `content_type`, the UI language and an
optional comment. The prayer topic, the person's answer, recordings and client
identity are not part of the request. An open report dialog holds the session
at timer expiry until it closes; a failed request keeps its comment available
for retry. Saved journal entries have no report action because they mix
generated content with private answers.
The report dialog uses keyboard padding on iOS and reduces its available
height on Android. Its comment scrolls while the footer stays above the
keyboard; tapping the backdrop dismisses the keyboard and preserves the draft.

Three independent SQLite records gate prayer-content transfers (ADR-0017,
ADR-0035): core prayer AI for the topic, answer context for typed answers and
finished transcripts, and audio transcription for one selected M4A file. Every record has
an `undecided`, `allowed` or `denied` decision, the disclosure version and the
provider-contract identity. Missing, malformed, obsolete and legacy permissive
values resolve to `undecided`; the old `share_answers=0` is retained as an
answer-context denial. Settings expose every decision separately. The current
notice version is 3 and the shared provider-contract identity is
`google-gemini-paid-whisper-self-hosted-2026-09`; prior records require a new
decision on load.

Before the first core AI use, the setup flow names the application server,
Google Gemini via its paid API and the purposes of sending the topic.
Without an allowance, question
generation uses the curated local pools and scripture selection sends neither
`topic` nor `user_replies`, while the non-contextual server safe pool remains
available. Core permission does not open the answer gate. An answer is always
saved locally first; the gate only decides whether it may leave the device. The
save awaits one SQLite transaction for the text and recordings; on failure the
sheet keeps the draft and shows an error. A save requested while another is in
flight waits for it instead of writing again. The first manual save of an answer
that could affect another request then shows its own Google Gemini disclosure
while the prayer is still running. The automatic save
before reflection and a save after the time has run out never ask, so navigation
is not blocked and an undecided gate stays closed until the next manual save. The
request builder includes answer text and completed transcripts only when both
gates are open. `lib/answerSave.ts` defines this order. The
composition, limits and ordering are defined by `lib/answerContext.ts` and
`lib/scripture.ts`.

Pressing "Transcribe" requests the feature but is not consent. The first attempt
explains that the selected audio file goes through Bible API for a verbatim
transcript by either Whisper on operator-managed servers or Google Gemini through
Google's paid API. The shared version 3 provider contract names both processors;
switching between them under those terms does not require renewed consent
(ADR-0035). A different processor or changed processing terms does.
The UI checks the decision before it starts, and
`lib/transcription.ts` repeats the gate before opening or uploading the local
file. The device locale remains a soft language hint. The returned transcript is
local data and needs the separate answer-context consent before it can be sent in
a later prompt.

The settings store is loaded before a first-use decision or a session network
request. Withdrawal closes the in-memory gate immediately and persists the new
record before the settings action completes, so the next request observes it.
`bible-api` does not store the topic, written answers, audio or transcript. Prayer
content and derived identifiers are not written into analytics, diagnostics or
crash logs.

## Checks and operational sources

### Build version allocation

The npm native and EAS build entry points reserve the next `expo.version` in
`app.json` through `scripts/bump-version.mjs` before compilation or upload:
production raises the minor and drops the patch (`1.1.3` → `1.2`), test builds
raise the patch of the current store version (`1.2` → `1.2.1`). See
[ADR-0034](decisions/0034-store-minor-test-patch-versions.md).
`scripts/build-production.sh` requires `android`, `ios` or `all` and reserves
one store version per release for both platforms; `--keep-version` builds one
platform of an already reserved release (the other platform or a retry) and is
refused with `all`. The EAS submit profile sends
Android builds to the internal track as drafts with the service account key
held in EAS credentials. See [ADR-0040](decisions/0040-google-play-release.md).
Local native builds run prebuild to synchronize existing native projects.
The About screen uses `expo-application.nativeApplicationVersion`, with an Expo
config fallback for web and Expo Go. This matches the installed version used
by the update gate. EAS remote build numbers remain independent.
The About footer always renders the installed version. A separate build-time
`EXPO_PUBLIC_BUILD_CHANNEL=test` adds a localized "Test build" label and API
origin. Local scripts and EAS development/preview select `test`; production
selects `store` for TestFlight, the App Store and Google Play. Missing channel values hide
test details. This is independent of Debug/Release optimization; local iPhone
installs remain standalone Release builds. See [ADR-0026](decisions/0026-test-build-label.md).
The App Store video build script sets `EXPO_PUBLIC_APPSTORE_VIDEO=1` in its
isolated simulator Release build.
The preview runner uses one capture and verification pipeline for iPhone and
iPad. `store/video/pacing.json` selects the named simulator, portrait output
size, HID typing interval, montage typing speed, and visual verification regions.
AXe recalibrates tap coordinates for each locale and device before recording.
On reflection, focus on the takeaway input then pauses the Skia flame at its
current frame until blur, keeping hardware-keyboard typing responsive in the
simulator video. Ordinary builds do not set this flag, so the flame continues
to animate normally. The reflection's flame component is memoized so a
controlled input update does not rebuild the Skia subtree for each character.
The capture procedure is in `store/README.md`.
Allocation is sequential per checkout; failed attempts may leave gaps, and the updated config
must be preserved in version control. See [ADR-0024](decisions/0024-build-patch-version.md).

### Commands and evidence

- `npm test` - local unit tests of the library logic.
- `npm run typecheck` - the TypeScript check.
- The Maestro flows and the results of manual runs are in `testing/`.
- ClickUp is the source of tasks, statuses and bugs; the architecture documents
  do not duplicate work management.
- `npm run iphone` - the path the project supports for a Release build and
  installation onto a physical iPhone.

## How to maintain this document

- Update this file in the same change that alters the actual boundaries,
  dependencies or data flows.
- Do not write plans in here as if they were existing behaviour.
- Record a significant decision with its alternatives and consequences as a
  separate ADR.
- Do not rewrite an ADR after it is accepted; a new decision supersedes the old
  one through a new ADR that refers to it.

### About screen contacts

The About screen loads contacts from `GET /api/about?app=lampada` on the existing Scripture
API origin, using `EXPO_PUBLIC_AI_PROXY_KEY` as `x-api-key`. It selects labels and subtitles in the interface language, falling back to English
and then Russian, in server-defined order and maps server SF Symbol names to
local icons. The project description remains local. Requests time out after ten
seconds and are cancelled when the screen unmounts. Loading, empty and retry
states are visible; contact URLs are restricted to web, mail and Telegram schemes.

## Interface language

Settings expose English, Russian and Ukrainian independently of Scripture
preferences (ADR-0021). The `ui_language` SQLite meta value publishes to Zustand
after a successful serialized write. The initial choice follows the first
supported device language, with English as fallback. React screens and overlays
subscribe through `useI18n`; library messages use `translate`. Bundled catalogs
include accessibility, privacy, errors, dates and reminder copy.

Changing the interface language reschedules system-held reminder text without
altering the saved schedule. Timer labels are passed into native rendering.
OS-owned permission prompts use native locale files and therefore follow OS app
language settings. Question requests carry the interface language as a default
when the server cannot determine the prayer-text language (ADR-0030). Stored
journal content and the independent Scripture selection are unchanged.

Plural selection uses the explicit English/Russian/Ukrainian cardinal rules in
`lib/uiLanguage.ts`; it does not require `Intl.PluralRules`, which is unavailable
in the installed iOS runtime.

## Server-controlled AI prefetch

Both `/api/ai/question` and `/api/ai/scripture` accept optional `prefetch: true`
in the request body. The app sets it for the threshold's first question, every
one-ahead question, the closing reflection prepared before the session ends, the
initial hidden scripture selection and subsequent one-ahead passages. Requests
made because the user needs content omit the field. The server decides whether
to admit background work independently for questions and scriptures.

HTTP 429 with `detail: "prefetch_disabled"` or
`detail: "prefetch_limit_exceeded"` means that no background content was generated.
Only the limit response carries `Retry-After`; the app does not schedule retries
for either response. These denials show no error and do not generate a local
fallback. Other failed background generations likewise return no content.
Question and reflection slots retain that empty outcome until consumed or their
context changes, so timer ticks cannot repeatedly request a denied warmup.

A user request consumes a successful prepared result or waits for its pending
request. If background work yielded no content, it performs an ordinary request
with the current context, including when demand arrived before the denial.
Normal foreground error handling remains in place. Deploy the API change before
releasing the updated app: older servers reject the new field with HTTP 422.
Question requests require server support for both `prefetch` and
`default_language`; deploying one contract change without the other is incompatible.
Older app builds cannot have their unmarked warmups controlled by the server's
prefetch policy.

## Bundled fallback question language

The first, follow-up and reflection fallback pools live in
`lib/locales/fallbackQuestions.ts` and follow the active interface language
(ADR-0022). The session initializes and resets its local questions from that
language. Prefetch keys include interface language to avoid reusing a ready local
question after switching. Existing questions and stored prayer content are not
translated retroactively.

Native permission localization is generated from app configuration and
`languages/` through Expo prebuild. The physical-iPhone deployment script derives
the workspace, scheme and app path from the generated Xcode project instead of
assuming the former Twinkler project name. It synchronizes native configuration
with prebuild before CocoaPods and xcodebuild, including when `ios/` already
exists, so permission translations cannot remain stale.
