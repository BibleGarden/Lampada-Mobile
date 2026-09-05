# ADR-0021: Independent interface language

## Status

Accepted

## Context

The interface must support English, Russian and Ukrainian with an explicit
in-app selector. Scripture already has its own language, translation and voice
selection. The model determines the language of questions from the topic and
answers; changing the interface must not change this behavior.

## Decision

Store `ui_language` independently in SQLite `meta`, exposed by the existing
Zustand settings store. Until an explicit choice is saved, select the first
supported device language using Expo SDK 57 Localization, falling back to
English. Save the choice before publishing it to subscribers, serialize writes,
and expose save failures in settings.

Use bundled catalogs in `lib/locales/` and reactive `useI18n` subscriptions for
interface copy. Plain library code resolves copy with `translate`; pure reminder
formatters accept a language argument. Dates and plural forms use the selected
interface language. About contacts select that language from server maps with
English and then Russian fallbacks.

Language changes reschedule local reminders through a serialized scheduler.
System timer copy is passed to iOS Live Activity props and the Android native
module. OS-owned permission dialogs and display names use bundled native
localizations and follow the OS app language, not the runtime selector.

User text, stored questions, transcripts, Scripture and AI request payloads keep
their existing content and language behavior. Selecting a translated topic example inserts exactly the displayed text; existing
topics are not rewritten when the interface language changes.

## Alternatives

- Reuse Scripture language: rejected because reading preferences and interface
  preferences are independent.
- Change model request language with the interface: rejected by the owner.
- Fetch interface translations remotely: unnecessary network dependency for
  navigation, errors and privacy controls.

## Consequences

All three catalogs must be updated together when interface text changes. UI
switching works without a restart or network request. Native localization and
Android timer contract changes require a new native build. Already recorded
content is never rewritten during a language change.
