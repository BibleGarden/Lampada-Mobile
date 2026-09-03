# ADR-0003: Contextual server-side scripture selection

- Status: Partly superseded by ADR-0004 (item 8 and the related consequence)
- Note 2026-08-30: the path of the method was renamed to
  `POST /api/ai/scripture`; the decision and the contract did not change, the
  historical text below is kept as it was
- Date: 2026-08-25
- Participants: product owner, developer, QA lead

## Context

The app rotated ten bundled Russian passages by numeric indices. Such a source
did not take the prayer topic into account, had no stable cross-translation
identifier and did not allow honest support for a server fallback, an offline
cache and the migration of favourites. The new Bible-API answers in roughly 5-7
seconds and is limited to three requests per minute per client, so loading on
every press would have created noticeable pauses and a risk of parallel requests.

## Decision

1. Use `POST /api/scripture/v1/select` as the main source. The values of `source`
   describe the way the server degraded and are not a user-facing error.
2. Keep `canonical_id` as the key of the exclusion history and of the server-side
   favourites. On `history_reset` clear only the exclusion history; do not touch
   the trail or the favourites. Build the visible reference exclusively from
   `passage`.
3. Start a prefetch of depth one after the passage is actually shown. Serialize
   all requests single-flight; a repeated press waits for the request already in
   flight.
4. Store the history in full, while the request builder sends up to the 30 most
   recent valid unique IDs.
5. Cache the full response and the book name in SQLite. The offline fallback uses
   only server snapshots that were shown before and never disguises the old
   catalogue.
6. Migrate the old favourites losslessly: create a backup table first, then store
   every record as a snapshot with a nullable `canonical_id`.
7. Load the `share_answers` setting before the first request. `user_replies` is
   added by a single request builder; the bodies of scripture requests and
   responses are not logged.
8. Keep the existing lifetime of the navigation trail within a session and the
   Russian Synodal translation (`ru`, translation `1`) until a separate product
   choice of language and translation appears.

## Options considered

### Keep the local rotation as the fallback of the first request

Rejected: the user would see an irrelevant local passage as the result of a
contextual choice. With an empty offline cache a neutral error and a retry are
shown instead.

### Load a new passage only on a press

Rejected because of the measured delay of about six seconds. A prefetch hides it
after the first display, and a depth of one respects the server rate limit.

### Store favourites by `canonical_id` only

Rejected: old records have no such ID and would be lost. A snapshot stays
self-sufficient and opens without a network.

## Consequences

- The first passage may show a waiting indicator; the following ones are usually
  ready in advance.
- The new native dependency `expo-network` requires a custom rebuild of the app.
- SQLite stores private text locally, but the network and analytics logs do not
  contain it.
- The global server limit of 10 requests per minute remains a release
  constraint.
- If the choice of language and translation becomes a user-facing one, it will
  need a separate product decision; the current implementation deliberately keeps
  `ru/syn`.

## References

- Expo Network SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/network/
- Expo SQLite SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/
