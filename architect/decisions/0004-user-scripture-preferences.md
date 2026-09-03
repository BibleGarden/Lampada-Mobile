# ADR-0004: The user's choice of scripture

- Status: Partly superseded by ADR-0005 (item 4)
- Date: 2026-08-27
- Participants: product owner, developer, QA lead
- Partly supersedes: ADR-0003, item 8

## Context

After the server-side selection was introduced, the app always requested the
Russian Synodal translation. The product owner decided to give the user the same
dependent choice of language, translation and narrator that BibleGarden iOS uses.
Playing the narrated quote itself will be implemented separately.

## Decision

1. Load the languages from `GET /api/languages`, and the active translations
   together with their `voices` from
   `GET /api/translations?language={alias}&only_active=1` of the same Bible API.
2. Treat the choice as a dependent triple `language → translation → voice`. When
   a parent changes, clear the child values, and allow saving only a complete
   triple that exists in the current catalogue.
3. Store the triple as a single JSON value `meta.scripture_preferences`,
   including the stable numeric codes of the translation and the voice and their
   display labels.
4. For existing and new installations without a saved choice, keep the previous
   default `ru`, translation `1`, voice `1`; do not change it silently by the
   device locale.
5. Freeze the language and the translation when a prayer session starts. Every
   request and prefetch of that session uses a single snapshot of the settings.
   The voice code is for now only stored, for the future audio.
6. Filter the offline fallback by the language and the translation of the current
   session. Do not change the existing passage-centric semantics of the history
   and of the favourites by `canonical_id`.

## Options considered

### Store every list independently

Rejected: between three SQLite records a request could read an incompatible
combination of language, translation and voice.

### Apply a change to a session already in progress

Rejected: a ready prefetch and the navigation trail could mix translations. A new
setting applies from the next entry into a session.

### Pick the default from the system language

Rejected for the migration: it would silently change the behaviour of existing
installations. The user changes the translation explicitly on the settings
screen.

## Consequences

- The settings screen needs an available catalogue to change the triple; the
  saved choice and the main flow stay available during a temporary catalogue
  error.
- The API can add new languages, translations and voices without releasing a new
  client.
- A saved ID that was removed from the catalogue is not offered as a valid
  choice.
- Voice playback will be able to use the stored `voiceCode` without migrating the
  format of the setting.
- The cache still keeps one latest snapshot per `canonical_id`; this preserves the
  previous model, and the filtering prevents serving another language offline.

## References

- Reference: https://github.com/BibleGarden/iOS-App
- Expo SQLite SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/
