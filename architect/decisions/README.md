# Architectural decisions

An ADR (Architecture Decision Record) captures a single significant decision: why
it was made, which options were considered and what it led to.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-architecture-documentation.md) | Accepted | Keep the architecture overview and the ADRs in the repository |
| [0002](0002-server-audio-transcription.md) | Partly superseded by ADR-0017 | Transcribe voice answers through the server-side Gemini proxy |
| [0003](0003-contextual-scripture-selection.md) | Partly superseded by ADR-0004, ADR-0007 and ADR-0017 | Select scripture on the server with a single-flight prefetch, canonical history and offline snapshots |
| [0004](0004-user-scripture-preferences.md) | Partly superseded by ADR-0005 | Pick the language, the translation and the narration from Bible API and freeze the choice for the session |
| [0005](0005-device-scripture-language-default.md) | Accepted | Choose the first scripture language from the device locale, falling back to English |
| [0006](0006-structured-scripture-verses.md) | Accepted | Render and highlight scripture by the structured verses of the chosen translation |
| [0007](0007-http-result-as-network-truth.md) | Accepted | Judge Bible API availability by the result of the HTTP request, without a network preflight |
| [0008](0008-scripture-verse-audio-alignment.md) | Accepted | Play a passage using the verse timings inside the chapter audio |
| [0009](0009-background-prayer-session.md) | Accepted | Count the timer by the absolute clock and keep the music playing in the background |
| [0010](0010-lock-screen-prayer-timer.md) | Accepted | Show the prayer deadline through the system timer on iOS and Android |
| [0011](0011-reactive-design-tokens.md) | Accepted | Rebuild the visual tokens and styles when the window geometry changes |
| [0012](0012-single-layout-fitted-to-window.md) | Accepted | Fit the prototype frame into the window: one layout for every orientation |
| [0013](0013-local-prayer-reminders.md) | Accepted | Remind about prayer with local notifications on a "days x times" schedule |
| [0014](0014-app-lock-pin-and-biometrics.md) | Accepted | Lock the app with a local PIN whose hash lives in the Keychain, with biometrics on top of it |
| [0015](0015-answer-sheet-single-scroll.md) | Superseded by ADR-0016 | Pin the question and the buttons in the answer sheet and give the rest to a single scroll |
| [0016](0016-separate-recordings-sheet.md) | Accepted | Separate voice recordings from the answer field and serialize recorder start/stop |
| [0017](0017-versioned-ai-consent.md) | Accepted | Gate the three AI content transfers with independent versioned consent records |
| [0018](0018-latest-human-reply.md) | Superseded by ADR-0019 | Send the latest human reply separately from AI generation context |
| [0019](0019-structured-question-history.md) | Accepted | Send structured question history with separate topic and stage |

## Rules

1. Copy [`template.md`](template.md) into a file named `NNNN-short-name.md`.
2. Use the next free four-digit number.
3. Keep the status `Proposed` while it is under discussion; once agreed, set
   `Accepted` or `Rejected`.
4. Do not change the meaning of an accepted ADR. To revisit it, write a new ADR
   and set the old one to `Superseded by ADR-NNNN`.
5. Add the decision to the index in this file and update the main architecture
   overview if needed.

An ADR is needed when a decision changes component boundaries, the storage or
the movement of data, an external contract, a key dependency, privacy
requirements, or the way the app is built and delivered. Small local
implementation details do not need one.

- [0020: Application-specific update checks](0020-application-version-check.md)

- [0021: Independent interface language](0021-interface-language.md)

- [0022: Localize bundled fallback questions](0022-localized-fallback-questions.md)
