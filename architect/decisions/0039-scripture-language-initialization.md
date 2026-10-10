# ADR-0039: Confirm Bible defaults before persisting them

- Status: Accepted
- Date: 2026-10-09
- Partly supersedes: ADR-0005, items 1–3, item 5 and the offline English start

## Context

A failed first-launch catalog request silently persisted English. A later launch
then treated the temporary substitute as a saved preference, even with Russian
interface language. The owner requested using the interface language and avoiding
any saved selection when the catalog cannot confirm it. Entering a prayer must
still not depend on the network.

## Decision

1. Read local settings independently of network initialization. The Bible
   selection stays null until an existing record is read or the catalog confirms
   a valid language/translation/voice triple. Nothing is substituted.
2. The initial language is the resolved interface language, not the device
   locale. ADR-0005 item 4 (preferred translation/voice pairs) still applies.
3. Only a confirmed triple is written, atomically. Catalog failures and missing
   translations/voices write nothing. Only one initialization runs at a time;
   serialized writes keep a delayed default from overwriting an explicit choice.
   An interface language changed during initialization restarts it for the new
   language instead of failing.
4. Starting a prayer never waits for the catalog. Without a confirmed selection
   the session starts with a null Bible snapshot, and the scripture block
   confirms it in the background. The block names the real cause of a failure.
   An unreachable catalog shows "Bible catalog unavailable" with Retry; Retry
   reruns initialization and, on success, the block works normally in the same
   session. A reachable catalog without a complete triple for the interface
   language shows a message with an action that opens Settings, and no retry; a
   choice saved there revives the block in the same session. A local storage
   error shows its own message with Retry and is written to diagnostics. The
   offline passage cache is not used without a confirmed language and
   translation.
5. Settings show the catalog error with Retry when the catalog is unreachable.
   When the catalog is reachable but has no complete triple for the interface
   language, Settings show the language list with a specific message, so the
   user can pick a Bible manually; the check reruns when the interface language
   changes on the same screen. A failed save of a manual pick, and any other
   storage failure, is shown as such and written to diagnostics; the session's
   "Open settings" screen keeps a reminder tap from leaving the prayer. An initialization that produced the selection hands
   its catalogs to Settings, which does not fetch them again.
6. A malformed `meta.scripture_preferences` record is not a selection. It is
   reported to the local diagnostics log as `scripture_preferences_invalid` and
   is replaced only by a confirmed triple.

## Compatibility

Old records contain no origin marker distinguishing an automatic English
substitute from a genuine user choice. Preserve them; do not guess or reset them.
An affected owner can select the desired language in existing Settings.

## Validation

Unit tests execute the real settings store with SQLite/catalog boundaries
replaced: failure without a write, recovery using saved interface language,
missing catalog options with the language list returned, saved choices while
offline, concurrent initialization, explicit choice and interface-language races,
and the malformed-record diagnostic. The real session store is tested for an
offline first launch: the prayer starts, the scripture block shows
`catalog_unavailable`, and Retry confirms the selection in the same session;
the missing-triple and storage errors keep their own causes. Maestro prepared
phases on iOS and Android cover the offline path (SCR-013) and the manual choice
when the interface language has no voiced Bible (SCR-027).
