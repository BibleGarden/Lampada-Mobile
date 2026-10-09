# ADR-0039: Confirm Bible defaults before persisting them

- Status: Accepted
- Date: 2026-10-09

## Context

A failed first-launch catalog request silently persisted English. A later launch
then treated the temporary substitute as a saved preference, even with Russian
interface language. The owner requested using the interface language and avoiding
any saved selection when the catalog cannot confirm it.

## Decision

Read local settings independently of network initialization. Keep the Bible
selection null until an existing record is read or the catalog confirms a valid
language/translation/voice triple. Initial language follows the resolved interface
language. Catalog failures and missing translations/voices propagate to existing
error/retry handling and never write a Bible setting. Successful defaults remain
persisted for offline use. Only one initialization runs concurrently; serialized
writes prevent a delayed default from overwriting an explicit choice. Initial
preference resolution precedes creating the prayer session so failure cannot
leave an orphaned journal entry.

## Compatibility

Old records contain no origin marker distinguishing an automatic English
substitute from a genuine user choice. Preserve them; do not guess or reset them.
An affected owner can select the desired language in existing Settings.

## Validation

Execute the real settings store with SQLite/catalog boundaries replaced: failure
without a write, recovery using saved interface language, missing catalog options,
saved choices while offline, concurrent initialization and explicit choice races.
Check existing language selectors and catalog error/recovery in Maestro.
