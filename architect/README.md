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
- Reanimated, Gesture Handler and Skia for animations, gestures and graphics.
- A custom native build: Expo Go does not support all the native modules in use.

Changes to the app are made against the documentation of
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) specifically.

## Application structure

| Area | Responsibility |
| --- | --- |
| `app/` | Screens and Expo Router navigation |
| `components/` | Reusable visual and interactive components |
| `components/AnswerSheet.tsx` | The text answer sheet and the coordination of the audio recording lifecycle |
| `components/RecordingsSheet.tsx` | A separate sheet for recordings, the player and transcripts, on top of the answer |
| `components/PrivacyConsentDialog.tsx` | The equal-weight first-use disclosure and allow/deny actions for an AI purpose |
| `lib/store.ts` | The state and the scenario of a prayer session |
| `lib/db.ts` | SQLite, migrations, the journal, favourites and the streak |
| `lib/ai.ts` | Prompts, validation of the AI response and local degradation |
| `lib/answerContext.ts` | The composition of the person's replies for the AI: the answer text and the transcripts of its recordings |
| `lib/questionRequest.ts` | Structured question history, stage metadata and request limits |
| `lib/aboutClient.ts` | Contact cards from the shared Bible Garden `/api/about` endpoint, response validation and request cancellation |
| `lib/llm.ts` | The HTTP client of the server-side AI proxy |
| `lib/transcription.ts` | Sending a local audio recording for server-side transcription |
| `lib/settings.ts` | Privacy settings, interface language, atomic scripture choice and reminder schedule saves |
| `lib/i18n.ts`, `lib/locales/` | Reactive English, Russian and Ukrainian interface translations |
| `lib/privacyConsent.ts` | The versioned consent record, provider-contract identity and legacy migration rules |
| `lib/lock.ts` | The PIN salt and hash in SecureStore, biometrics, the lock state and the full data wipe |
| `lib/prayerReminders.ts` | The pure model of the reminder schedule: validation, WEEKLY triggers, the human-readable line, the phrase pool |
| `lib/prayerReminderScheduler.ts` | The channel, the permission and the full rescheduling of local reminders through expo-notifications |
| `lib/scripture.ts` | The types of the scripture contract, the request builder and the display model |
| `lib/scriptureClient.ts` | The HTTP client of the contextual selection and the controlled retries |
| `lib/scriptureAudioClient.ts` | Book aliases, verse-level timings and the public URLs of chapter audio |
| `lib/useScriptureAudio.ts` | The player lifecycle for the selected passage and the temporary audio focus |
| `lib/audioModeCoordinator.ts` | The single queue of the global Expo audio mode and the priority recording lease |
| `lib/audioPlayerOperation.ts` | Waiting for a replaced local AVPlayerItem to be ready and cancelling a stale play |
| `lib/recordingOperation.ts` | The single-flight lifecycle of starting, stopping and interrupting a voice recording |
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
| `lib/theme.ts` | Visual tokens, `useStyles` - rebuilding the styles when the window geometry changes (ADR-0011), `column()` - the content column of the single layout (ADR-0012) |
| `assets/audio/` | The local music files and the record of their origin and licenses |
| `testing/` | Scenarios, Maestro flows, reports and final evidence |

## Screens and navigation

| Route | Role |
| --- | --- |
| `/` | Home, the streak and the entry points into the main sections |
| `/setup` | The prayer topic and the duration |
| `/threshold` | Preparing to start the session and generating the question in advance |
| `/session` | The timer, the questions, the answers and scripture |
| `/reflect` | The closing question and the wording of the takeaway |
| `/done` | Finishing and returning Home |
| `/journal` | Prayer history, search, playback, saved quotes and deletion |
| `/settings` | Settings for the language, the translation, the narration, privacy, reminders and the lock |
| `/favorites` | Saved quotes: the key verses, expandable into the full passage |
| `/about` | The point of the app, API-backed contacts, the version and the author's other projects |

`session`, `reflect` and `done` cannot be left by an accidental system gesture:
the scenario is finished through explicit interface actions.

## State and the main data flow

`useSession` in `lib/store.ts` is the single model of a running prayer session.
It holds the topic and the timer, the current questions and answers, the
scripture state, the mode of the bottom panel, the reflection takeaway and the
streak.

The main flows:

```text
Screen → useSession → lib/db.ts → SQLite / local audio files
                   ↘ lib/ai.ts → lib/llm.ts → bible-api → company-hosted chat model
                               ↘ local curated fallback
                   ↘ lib/transcription.ts → bible-api → company-hosted speech model
                   ↘ lib/scriptureClient.ts → bible-api /api/ai/scripture
                                            ↘ lib/scriptureRepository.ts → SQLite
                   ↘ lib/scriptureAudioClient.ts → bible-api /api/excerpt_with_alignment
                                                 ↘ /api/audio/...mp3
                   ↘ lib/scriptureCatalogClient.ts → bible-api /api/languages
                                                     ↘ /api/translations
```

The AI is not required to go through a prayer. When there is no configuration, or
on a network error, a timeout or a malformed response, `lib/ai.ts` returns a
question from the local pool. Later questions use a buffer one question ahead;
stale asynchronous results are cut off by keys and tokens.

During a session the user can turn on quiet local music. Fifteen bundled CC0
tracks play in a looping queue without a network and keep playing when the app is
backgrounded and the screen is locked. The player registers as a system media
session, and native background playback is enabled by the `expo-audio` config
plugin. The music stops when the prayer ends. Voice recording, playback of a
draft and scripture narration take the audio focus temporarily: the music is
paused until the corresponding action finishes, so that it does not leak into a
recording or mix with the user's audio.

The prayer timer keeps the absolute moments of the start and of the planned end
in the runtime session state. The one-second tick is only needed to update the
interface: the actual `elapsed` and `remaining` are computed from the system
clock every time, so after coming back from the background the timer immediately
catches up with the interval that passed. A session unloaded by the OS is not
restored yet, and the transition to reflection happens once JavaScript is active
again.

For a finite prayer the same `endsAtMs` is handed to a system surface: iOS shows
an `expo-widgets` Live Activity on the Lock Screen and in the Dynamic Island,
Android shows a separate ongoing notification from a local Expo Module. The
SwiftUI timer interval and the Android notification chronometer update the
seconds without background JavaScript. Changing the duration replaces the system
deadline, and finishing or resetting removes the card. An infinite prayer creates
no system card. The media controls of the music stay independent: pausing a track
does not change the prayer deadline.

The main scripture selection is done by the server with AI, by the meaning of the
prayer topic and of the person's replies that the setting allows, not by keyword
match. The first request starts in the background on entering the session, and
after the first display exactly one prefetch is kept alive. No more than one
selection request runs at a time. `source: retrieval_fallback` and
`source: safe_pool` count as successful responses. The navigation trail contains
only the passages that were actually shown and lives within the current session;
the app walks back along it without a network. The stable `canonical_id` is used
for exclusions and favourites, but the user-facing reference is always built from
the `passage` coordinates of the chosen translation. When `passage.verses` is
present, the text is assembled from the structured verses, and the
`highlight.passage` range defines the key verses in the numbering of the chosen
translation. The compact card shows only those verses and always in a single font
colour; the whole passage with the golden highlight of the key verses stays in
the full reader, which is opened both by tapping the card text itself and by the
"Read in full" link - both available when the card truncates the text and when it
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
a PIN of 4 to 8 digits, with the length chosen by the user. Face ID, Touch ID or
a fingerprint is a separate toggle strictly on top of the PIN, available only
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

Covering pixels hides the content only from the eyes and from touches, so both
overlays additionally hide it from screen readers - and they do it differently on
the two platforms. On iOS the `accessibilityViewIsModal` flag on the overlay
itself is enough: VoiceOver stops seeing everything outside the modal node.
Android has no such flag, and the mark has to be put from the other side - on the
subtree being hidden - so the `Stack` in `app/_layout.tsx` is wrapped in a
layout-neutral `View` subscribed to the lock state, and the settings content under
the PIN input is marked where it is rendered. The shared helper is `lib/a11y.ts`:
on iOS it yields no props at all, on Android it sets
`importantForAccessibility="no-hide-descendants"`.

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
| `meta` | Settings and service values, including `prayer_reminders` - the reminder schedule as a single JSON value |
| `prayed_days` | The days used to compute the streak |

A quote is tied to a prayer through `scripture_favorites.session_id`, which is set
at the moment it is saved. For records made before the column existed, the link is
restored once by time: a quote belongs to the prayer in whose interval
`started_at … started_at + elapsed_sec` it was saved. Those that fall into no
interval stay `NULL` - there is nothing to restore the link from. The journal
shows the quotes of a prayer at the end of the expanded card, with the full text
in a popup.

The audio files live in the document directory of the app. The database stores a
portable URI and the text of the transcript; the URI is resolved against the
current document directory. The transcript is shown in the journal and takes part
in the local search. Deleting a session deletes its answers and recordings, but
does not change the historical day in the streak.

While answering, the text and the voice recordings are split between two sheets
(ADR-0016). `AnswerSheet` holds the answer field, `RecordingsSheet` holds the
audio files and their transcripts. The asynchronous recorder start/stop are
serialized: a pending state immediately blocks a repeated action and the closing
of the upper sheet. The global audio mode is changed only through
`audioModeCoordinator`: while a recording lease is active, the music and the
scripture audio cannot apply a playback mode and natively cut the recording short
on iOS. The background music uses two automatically released `AudioPlayer`s: the
next local track is loaded in advance and starts sounding two seconds before the
end of the current one, with a crossfade of the volumes. During recording,
scripture narration, when the music is turned off or when the prayer ends, both
players are paused in sync and an unfinished crossfade is reset.

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
mount through `lib/versionCheck.ts`. The shared API receives `app=lampada`;
only matching responses may trigger optional or mandatory update screens.
The overlay sits above navigation and below `LockGate`, with accessible content
isolation. Network errors leave the app usable. Lampada updates remain disabled
server-side until its App Store listing is published. See ADR 0020.

## AI and privacy

The app talks to a `bible-api` server endpoint which owns model routing, model
credentials and system prompts. Chat and speech models run on infrastructure
managed by the company; changing a stage's model is a server configuration
change and does not alter the client contract. Question requests use
`{ topic, stage, messages }` (ADR-0019). The topic is separate from conversation
history; `stage` selects the server's first, next or reflection question prompt.
`lib/questionRequest.ts` pairs each answered question with its human reply in
ascending question-index order. One user message joins typed text and completed
transcripts with newlines. Unanswered questions are omitted, and an empty history
is valid. Nonempty history ends with a user message. Requests retain at most 40
messages and 16,000 UTF-16 code units across the topic and message text, dropping
oldest messages without truncating the latest reply. Core and answer consent are
rechecked before transfer. Only public Expo variables -
the URL and the limited proxy key - may be embedded into a client build; server
secrets and system instructions are not put into the app.

Three independent SQLite records gate prayer-content transfers (ADR-0017): core
prayer AI for the topic, answer context for typed answers and finished
transcripts, and audio transcription for one selected M4A file. Every record has
an `undecided`, `allowed` or `denied` decision, the disclosure version and the
provider-contract identity. Missing, malformed, obsolete and legacy permissive
values resolve to `undecided`; the old `share_answers=0` is retained as an
answer-context denial. Settings expose every decision separately.

Before the first core AI use, the setup flow names the application server,
company-managed model infrastructure and the purposes of sending the topic.
Without an allowance, question
generation uses the curated local pools and scripture selection sends neither
`topic` nor `user_replies`, while the non-contextual server safe pool remains
available. Core permission does not open the answer gate. The first saved answer
that could affect another request gets its own disclosure; the request builder
includes its text and completed transcripts only when both gates are open. The
composition, limits and ordering are defined by `lib/answerContext.ts` and
`lib/scripture.ts`.

Pressing "Transcribe" requests the feature but is not consent. The first attempt
explains that the selected audio file goes through Bible API to a speech model on
company-managed infrastructure only for a verbatim transcript. The UI checks the decision before it starts, and
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
language settings. AI requests, model language inference, stored journal content
and the independent Scripture selection are unchanged.

Plural selection uses the explicit English/Russian/Ukrainian cardinal rules in
`lib/uiLanguage.ts`; it does not require `Intl.PluralRules`, which is unavailable
in the installed iOS runtime.
