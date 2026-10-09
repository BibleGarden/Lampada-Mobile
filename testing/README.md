# Testing Lampada

The repository holds only what is needed to repeat a check and to be sure of its
result. Planning, statuses, assignees and defects live in ClickUp - they are not
duplicated here, otherwise the two pictures drift apart.

## What lives where

| Path | Contents | Does it change |
| --- | --- | --- |
| [`TEST_PLAN.md`](./TEST_PLAN.md) | Scenario identifiers (`SMK-*`, `REM-*`, `LOCK-*` and the rest) and the expected behaviour | A living document, it grows with the app |
| `e2e/` | Executable Maestro scenarios | Living |
| `reminder-fire/` | Clock-dependent Maestro flows run only by `e2e/run-rem-fire.sh` | Living |
| `reports/` | Dated results of runs | Immutable: a new run means a new file |
| `evidence/` | Evidence for the reports: final screenshots, decisive logs, data snapshots | Immutable, the rules are in [`evidence/README.md`](./evidence/README.md) |

The scenario identifier is the shared key between the test plan, the flow, the
report and the ClickUp task. Everything is tied together through it.

## Running

Android critical flows are kept separately in `android-e2e/`, so they are not
picked up by the existing iOS tier commands. Build Android Release with test
API variables, use Russian as the emulator's primary locale, and run
`npm run test:e2e:android:critical`. Its sequential runner preserves the full
smoke → relaunch pair and stops at the first failure. Full logs, per-flow exit
codes and Maestro artifacts are saved in the printed output directory; use
`ANDROID_TEST_OUTPUT_DIR` to choose a stable location.
Preflight prints this directory first and shows failed environment diagnostics.
It then pulls the installed base APK and reads its manifest with `apkanalyzer`,
without starting the app. Its recorded channel must be `test` and its API origin
must match `.env.local` and differ from production. An APK predating this metadata
must be rebuilt. The temporary APK copy is removed on success and on failure.

Android `main` and `rare` counterparts also live in `android-e2e/`:

```bash
npm run test:e2e:android:main
npm run test:e2e:android:rare
npm run test:e2e:android:ordered
```

The ordered command covers PIN enable/unlock/change/disable, short and long
background returns, forgotten-PIN cancellation and wiping real journal data,
and reminder-editor confirmations. It preserves each suite's prerequisite order.

These suites use Gboard keyboard selectors, Android share-sheet dismissal and
stable app IDs. Maestro's Unicode `inputText` temporarily replaces Gboard
with its own IME, so it must not be used to establish focus preconditions.
Keyboard gesture fixtures use ASCII input; ANS-032 also taps a real Russian
Gboard key and verifies that its Cyrillic character survives saving/reopening.
Unicode persistence and search checks remain separate from focus checks. After a cold launch or relaunch,
assert that Home is ready before issuing a Settings/Setup deep link; Android
launch completion alone does not establish a mounted router. Non-deadline fixtures are untimed; finite completion and early
music completion retain timed prayers. Display-size changes used to reduce
emulator screenshot cost must preserve the logical viewport and be reset after
testing. The tier runner stops at the first failure and records each flow's
full output and exit code, just like the critical tier.

Controlled Android scenarios use a separate Release build with
`EXPO_PUBLIC_API_URL=http://10.0.2.2:9085` in `.env.local` and
`EXPO_PUBLIC_FORCE_SESSION_ERROR=1` for the build. Start `npm run scripture:stub`
on the host, build Android Release, and run its critical gate before the
prepared phase. The host control endpoint remains `http://localhost:9085`.

Database checks and legacy-favorite seeding use a small instrumentation APK
signed with the same local test key. It operates inside the test app's database
context, without root or a Debug build. Both its host wrapper and native code
reject physical devices; native code also rejects missing test-channel metadata
and the production API origin. Build and install it only on the test emulator:

```bash
ANDROID_PROBE_OUTPUT=/tmp/lampada-database-probe bash scripts/build-android-test-probe.sh
adb -s emulator-5554 install -r /tmp/lampada-database-probe/LampadaTestProbe.apk
npm run test:e2e:android:prepared -- --device emulator-5554 --output /tmp/lampada-android-prepared
```

The prepared runner preserves dependent transcription/favorite order, stops on
failure and records full logs and exits. It checks orphaned recordings and
seeds the legacy format through the signed probe. Restore the normal API
configuration and normal Release APK afterward; uninstall the probe when done.

Individual Android flows use the same installed-APK preflight and sequential
runner as the critical tier. Pass flow names without a path or `.yaml` extension.
The Android ANS-024 regression flow is separate from the critical tier. It opens
existing voice recordings while the answer keyboard is visible and checks that
the keyboard closes, the recording actions are reachable, and returning to the
answer preserves text and restores editing:

```bash
npm run test:e2e:android -- android-ans-024-recordings-keyboard
```

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
npm run test:e2e:all       # normal-build flows and self-contained ordered suites; excludes iPad and prepared flows
npm run test:e2e:ipad      # iPad group, on the one booted iPad simulator (or UDID=)
```

Tier commands scan `e2e/` only. The three clock-dependent reminder flows live
in `reminder-fire/` and are run by `e2e/run-rem-fire.sh`, which creates their
time-setting helper flow. A clean `/tmp` is sufficient for tier runs. The runner
refuses a stale `/tmp/rem-set-time.yaml` helper and removes the helper it creates on exit.

The `prepared` tag marks flows that need a stub build, seeded data, an earlier
flow's state, a simulator setting or a wrapper script. `test:e2e:all` excludes
both `prepared` and `ipad`; run prepared flows through their documented setup.
The four ordered suites below start from a clean state, carry no tag and run
in `test:e2e:all`; members that depend on an earlier member carry `prepared`.

The tier runs use the iPhone 17 Pro simulator, so the device-agnostic
`ios-ans-023-recordings-actions.yaml` (ANS-023) and
`ios-scr-025-reader-dynamic-island.yaml` (SCR-025) run in `main` on an iPhone
with a Home Indicator and a Dynamic Island. The iPhone app is portrait-only, so
the rotation flows `ios-ipad-*.yaml` carry only the `ipad` tag and run through
`test:e2e:ipad`, together with ANS-023. On an iPhone SE, run ANS-023 directly:
`maestro --device <udid> test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-ans-023-recordings-actions.yaml`.
Maestro saves landscape screenshots unrotated.

Some flows have interdependencies a tag run cannot guarantee (order is not
deterministic) and are excluded from the tier tags. They run whole as ordered
suites, in `test:e2e:all` or directly:

```bash
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-lock-suite.yaml        # LOCK-001…007 (PIN state chain)
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-jrn-suite.yaml         # JRN with shared journal data
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-background-suite.yaml  # music/timer across backgrounding
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-lock-006-suite.yaml    # forgot-pin prepare → wipe
```

A separate group needs a prepared environment (stub server, seeded data or a
debug hook) and is tracked in ClickUp task 86cbj95j4. The four scripture
context and highlight flows carry `prepared`, with no risk-tier tag. Run them
against a Release build whose `EXPO_PUBLIC_API_URL` points at the stub:

```bash
EXPO_PUBLIC_API_URL=http://localhost:9085 npx expo run:ios --configuration Release --no-bundler
```

Start the stub in a separate terminal in `main` mode. Run the two flows in
order, resetting its passage counter between them:

```bash
SCRIPTURE_STUB_MODE=main npm run scripture:stub
# In the original terminal:
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-scripture-context-main.yaml
curl -fsS -X POST http://localhost:9085/__control -H 'Content-Type: application/json' -d '{"resetScripture":true}'
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-scripture-highlight.yaml
```

Stop the stub, start it again in `privacy` mode, and run its flow. Repeat for
`fallback` mode. Run each Maestro command in the original terminal:

```bash
SCRIPTURE_STUB_MODE=privacy npm run scripture:stub
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-scripture-context-privacy.yaml
SCRIPTURE_STUB_MODE=fallback npm run scripture:stub
maestro test --test-output-dir "$TMPDIR/pray-e2e-output" testing/e2e/ios-scripture-context-fallback.yaml
```

Then reinstall the normal Release build without the URL override.

SCR-002 uses `ios-stage06-scr-002a-favorite-relaunch.yaml` followed by
`ios-stage06-scr-002b-favorite-relaunch.yaml`, with the stub passage counter
reset between them. The runner guarantees both prayers receive the same
fixture before checking persisted favorite state.

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

On Setup, flows close the keyboard with `pressKey: Enter` (the goal field's
"Done" key), not `hideKeyboard`. Maestro's `hideKeyboard` drags a few points
in the middle of the screen, which on Setup lands inside the goal field while
typing and moves the cursor instead of closing the keyboard.

### iOS runner prerequisites and cleanup

Language flows match the complete accessibility label of the language picker.
`run-lng.sh` boots the `Pray Smoke iPhone 17 Pro` simulator if needed, changes
its locale settings before rebooting, and stops at the first failed flow. On
exit it returns the simulator to `ru_RU` / `ru`, also after a failure, and keeps
the failing exit code. A successful run also restores the app interface to
Russian with `ios-lng-restore-ru.yaml`.

PIN runners use the tracked `ios-lock-cleanup.yaml` flow with test PIN 123456.
`run-lock-storage-check.sh` and `run-lock-biometrics.sh` run it on any exit,
including Ctrl-C, while the test PIN is on, so a failed check does not leave
the PIN enabled; cleanup errors are failures. Both write command logs to the
evidence directory. The biometric preflight scrolls to the protection section
before checking the visible hierarchy. It sets the simulator notification state
`com.apple.BiometricKit.enrollmentChanged` explicitly to 1 for enrollment and 0
for removal; the old `fingerTouch.enrollment` post does not enroll Touch ID on
the current runtime. Biometric signals are synchronized with the flow reaching
its wait after the native authentication prompt appears. A mismatch keeps the
iOS retry prompt open; select its PIN action to verify code entry.

LOCK-008 is a manual Device Hub check. Run `run-lock-appswitcher.sh prepare`,
open App Switcher using Device Hub's Home control, then run the script with
`capture`. Inspect the screenshot for the privacy curtain before marking the
scenario passed. Run `cleanup` afterward. Capturing a screenshot alone does
not assert the privacy outcome.


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
