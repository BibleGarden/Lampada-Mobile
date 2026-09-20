# Testing Lampada

The repository holds only what is needed to repeat a check and to be sure of its
result. Planning, statuses, assignees and defects live in ClickUp - they are not
duplicated here, otherwise the two pictures drift apart.

## What lives where

| Path | Contents | Does it change |
| --- | --- | --- |
| [`TEST_PLAN.md`](./TEST_PLAN.md) | Scenario identifiers (`SMK-*`, `REM-*`, `LOCK-*` and the rest) and the expected behaviour | A living document, it grows with the app |
| `e2e/` | Executable Maestro scenarios, 68 flows | Living |
| `reports/` | Dated results of runs | Immutable: a new run means a new file |
| `evidence/` | Evidence for the reports: final screenshots, decisive logs, data snapshots | Immutable, the rules are in [`evidence/README.md`](./evidence/README.md) |

The scenario identifier is the shared key between the test plan, the flow, the
report and the ClickUp task. Everything is tied together through it.

## Running

Build and launch the app the way the root [`README.md`](../README.md) describes.
Expo Go is not suitable: the project uses native modules it does not have.

```bash
maestro test testing/e2e/ios-smoke-full.yaml           # the main smoke
maestro test testing/e2e/ios-smoke-full-relaunch.yaml  # persistence after a relaunch
```

Individual scenarios are run the same way, by the file name from `e2e/`.

The flows carry risk-tier tags (`critical` / `main` / `rare`, see the legend in
[`TEST_PLAN.md`](./TEST_PLAN.md)):

```bash
npm run test:e2e:critical  # group 1: P0 paths, every build
npm run test:e2e:main      # group 2: the main functionality, before a release
npm run test:e2e:rare      # group 3: slow, destructive and edge scenarios
npm run test:e2e:all       # everything
```

Some flows have interdependencies a tag run cannot guarantee (order is not
deterministic) and are excluded from the tier tags. Run them as ordered
suites, whole:

```bash
maestro test testing/e2e/ios-lock-suite.yaml        # LOCK-001…007 (PIN state chain)
maestro test testing/e2e/ios-jrn-suite.yaml         # JRN with shared journal data
maestro test testing/e2e/ios-background-suite.yaml  # music/timer across backgrounding
maestro test testing/e2e/ios-lock-006-suite.yaml    # forgot-pin prepare → wipe
```

A separate group needs a prepared environment (stub server, seeded data or a
debug hook) and is tracked in ClickUp task 86cbj95j4. The scripture flows run
against a Release build pointed at the stub:

```bash
EXPO_PUBLIC_API_URL=http://localhost:9085 npx expo run:ios --configuration Release --no-bundler
SCRIPTURE_STUB_MODE=privacy npm run scripture:stub
maestro test testing/e2e/ios-scripture-context-privacy.yaml
# …then reinstall the normal Release build (re-run without the URL override).
```

## What to do with the result

A run worth remembering is described by a file in `reports/` with the date in its
name. The report names the scenarios that were checked, their outcome and the
evidence files it refers to.

A defect that is found is filed in ClickUp as a subtask of type `Bug` under the
stage where it was found, and closed there after the retest. A postponed or
deliberately accepted defect is moved to stage `99`. There are no local
`BUG-*.md` files in the repository.

## Evidence

Only selected material goes into `evidence/`, and every file has to be referenced
from a report - a file with no reference counts as orphaned and is deleted during
cleanup. Repeated attempts, full system and Xcode logs, duplicate crash reports
and build artifacts are not added to the repository.
