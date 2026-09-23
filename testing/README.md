# Testing Lampada

The repository holds only what is needed to repeat a check and to be sure of its
result. Planning, statuses, assignees and defects live in ClickUp - they are not
duplicated here, otherwise the two pictures drift apart.

## What lives where

| Path | Contents | Does it change |
| --- | --- | --- |
| [`TEST_PLAN.md`](./TEST_PLAN.md) | Scenario identifiers (`SMK-*`, `REM-*`, `LOCK-*` and the rest) and the expected behaviour | A living document, it grows with the app |
| `e2e/` | Executable Maestro scenarios | Living |
| `reports/` | Dated results of runs | Immutable: a new run means a new file |
| `evidence/` | Evidence for the reports: final screenshots, decisive logs, data snapshots | Immutable, the rules are in [`evidence/README.md`](./evidence/README.md) |

The scenario identifier is the shared key between the test plan, the flow, the
report and the ClickUp task. Everything is tied together through it.

## Running

Build and launch the app the way the root [`README.md`](../README.md) describes.
Expo Go is not suitable: the project uses native modules it does not have.

```bash
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-smoke-full.yaml           # the main smoke
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-smoke-full-relaunch.yaml  # persistence after a relaunch
```

Flows use bare `takeScreenshot:` names, so screenshots go to the Maestro test
output directory. `npm run test:e2e:*` points it at `$TMPDIR/pray-e2e-output`;
a direct `maestro test` needs the same `--test-output-dir`, otherwise
screenshots land in the current directory (the root `.gitignore` keeps
`/*.png` out of git).

The shell runners in `e2e/*.sh` (`run-lock-appswitcher.sh`,
`run-lock-biometrics.sh`, `run-rem-fire.sh`, `run-stub-phase.sh`, and the
smaller ones) follow the same rule: they default to `$TMPDIR/pray-e2e-output`
and only write into `evidence/` when called with `EVIDENCE_DIR=testing/evidence/<date>-<topic>`.

Capturing evidence for a report is a separate, explicit step: point
`--test-output-dir` (or `EVIDENCE_DIR` for the shell runners) at a new dated
folder under `evidence/` instead. Maestro puts screenshots in a
`screenshots/` subfolder of that directory.

```bash
maestro test --test-output-dir testing/evidence/2026-09-23-topic testing/e2e/ios-foo.yaml
# → testing/evidence/2026-09-23-topic/screenshots/NAME.png

EVIDENCE_DIR=testing/evidence/2026-09-23-topic bash testing/e2e/run-rem-fire.sh
```

Individual scenarios are run the same way, by the file name from `e2e/`.

The flows carry risk-tier tags (`critical` / `main` / `rare`, see the legend in
[`TEST_PLAN.md`](./TEST_PLAN.md)):

```bash
npm run test:e2e:critical  # group 1: P0 paths, every build
npm run test:e2e:main      # group 2: the main functionality, before a release
npm run test:e2e:rare      # group 3: slow, destructive and edge scenarios
npm run test:e2e:all       # everything except the iPad-only flows
npm run test:e2e:ipad      # iPad group, on the one booted iPad simulator (or UDID=)
```

The tier runs use the iPhone 17 Pro simulator, so the device-agnostic
`ios-ans-023-recordings-actions.yaml` (ANS-023) and
`ios-scr-025-reader-dynamic-island.yaml` (SCR-025) run in `main` on an iPhone
with a Home Indicator and a Dynamic Island. The iPhone app is portrait-only, so
the rotation flows `ios-ipad-*.yaml` carry only the `ipad` tag and run through
`test:e2e:ipad`, together with ANS-023. On an iPhone SE, run ANS-023 directly:
`maestro --device <udid> test testing/e2e/ios-ans-023-recordings-actions.yaml`.
Maestro saves landscape screenshots unrotated.

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

The wider stub phase (update banners, journal transcription, delayed AI
answers, scripture navigation, legacy favorites migration, the threshold
error path) runs under one orchestrated session. The build additionally needs
`EXPO_PUBLIC_FORCE_SESSION_ERROR=1` (the e2e hook in `lib/store.ts` fires
only for topics starting with `STG`, so the rest of the build behaves
normally), and the stub is switched between steps through
`POST localhost:9085/__control`:

```bash
EXPO_PUBLIC_API_URL=http://localhost:9085 \
EXPO_PUBLIC_FORCE_SESSION_ERROR=1 \
  npx expo run:ios --configuration Release --no-bundler
npm run scripture:stub
bash testing/e2e/run-stub-phase.sh
# …then reinstall the normal Release build (re-run without the overrides).
```

Three more groups are driven by wrapper scripts because Maestro cannot send
system signals, evaluate the current clock or hear audio:

```bash
bash testing/e2e/run-rem-fire.sh       # REM-004/005/006/008: scheduled-notification firing
bash testing/e2e/run-lock-biometrics.sh  # LOCK-009/010: simulator Face ID via BiometricKit signals
bash testing/e2e/run-background-music-timer-end.sh  # MUS-009: music stops at the deadline in the background
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
