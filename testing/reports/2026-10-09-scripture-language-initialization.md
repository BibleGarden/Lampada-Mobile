# Initial Bible language — 2026-10-09

Source `d028086`, based on fresh `main` `53e73ac`.

A failed catalog request no longer installs and persists an English substitute.
Local settings load without a catalog request. Until a saved selection is read or
the catalog confirms a complete language/translation/voice triple, Bible settings
are null. Initial selection follows the resolved interface language. Existing
catalog error/retry controls show failures; successful confirmation persists one
atomic triple. Saved settings work offline and are preserved. Concurrent explicit
selection wins over a delayed default, and failure cannot create an orphaned
prayer session. No new UI controls were added.

## Checks

All artifacts are in `testing/evidence/2026-10-09-scripture-language-initialization/`:

- `npm run typecheck`: exit 0 (`typecheck.log`, `.exit`).
- `npm test`: 339 tests, exit 0 (`unit.log`, `.exit`). New tests execute the actual
  settings store with SQLite/catalog boundaries replaced, including failure,
  recovery, missing language/voice, failed translations, concurrent loads,
  saved choices offline, and manual/interface-language changes during loading.
- Production iOS JS export: exit 0 (`ios-export.log`, `.exit`).
- Three prepared Maestro phases and independent read-only SQLite checkpoints:
  exit 0 (`ios-phases.log`, `.exit`, `ios-scripture-catalog-*.log`, `.exit`,
  `*-meta.json`, `.png`). A first-launch HTTP 503 leaves no
  `meta.scripture_preferences`; recovery picks `en/16/151` following the saved
  English interface on a Russian device. Another HTTP 503 retains the confirmed
  English Bible while the interface is Russian.

The live check reused an existing **1.3.40 Release simulator native binary** with
newly exported production JS/assets from this source and local signing. This is
not a new native build. `build-identities.json` records the exact JS hash and
limits. No full critical/main/rare/ordered suites were restarted under the
owner's narrowed verification scope. Android live checks were not run; matching
prepared phases are committed, and the platform-independent logic is tested.

The executed host wrapper was `python3 /tmp/pray-scripture-language-2026-10-09/run-ios-phases.py`;
its repeatable equivalent is `scripts/test-scripture-initialization.py` (see
`testing/README.md`). It controls the local stub between failure, recovery and
saved-offline phases, stops on the first failure, and records full command output
and exits. Native bounds/keyboard behavior were outside this change.

## Existing installations

Legacy rows contain no provenance marker. An old automatically substituted
English value cannot be distinguished from a genuine explicit choice. Preserve
these records instead of guessing; affected owners can choose Russian in the
existing Settings screen. The physical Android phone was disconnected and was
not updated during this change.
