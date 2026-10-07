# Android critical verification — 2026-10-07

All **10 critical scenarios passed** on Pixel 9 Pro API 35 (Android 15,
x86_64), using standalone native Release **1.3.4** and the owner's test API.
Metro was stopped before the Release checks. TypeScript and the unit suite
also exited 0. This is critical-path verification, not complete release acceptance.

## Tested revision and configuration

The build started from `2dc8d1e` with the application and Android-build fixes
in this change. `results.json` records SHA-256 fingerprints of `app/index.tsx`,
`plugins/withAndroidBuild.js`, `app.json`, and each published Android flow.
The published flows are byte-for-byte copies of those actually run; only their
filenames changed from the original `ios-` prefix to `android-`.

The test API's address and key both differed from the inactive production
configuration. Required variables passed the preflight validator, and About
displayed the test origin. Neither key is included in the report or evidence.
The generated Android manifest allowed HTTP for the explicit test channel,
and Gradle used a 4 GiB heap with 1 GiB metaspace. The installed package had
version 1.3.4 and no DEBUGGABLE flag.

## Results

| Scenario | Result |
| --- | --- |
| Empty journal and Cyrillic search | exit 0 |
| Goal examples, duration presets, short/full hold and free prayer | exit 0 |
| Repeated Start taps, one Back to Home and draft reset | exit 0 |
| Finite timer expiry, return to prayer and manual finish | exit 0 |
| Save a text answer and reopen it | exit 0 |
| Complete without a takeaway | exit 0 |
| Complete with a takeaway and find it in the journal | exit 0 |
| First-use AI disclosure, refusal and persisted privacy setting | exit 0 |
| Full prayer cycle, answer, takeaway and journal | exit 0 |
| Relaunch and verify saved answer/takeaway | exit 0 |

The runs were performed through Maestro 2.11.0. The full smoke preceded its
relaunch check immediately. The sequential runner stopped at failures; a
scenario was run again only after its cause was addressed and with the owner's
authorization. Successful scenarios were retained rather than rerun unnecessarily.

## Defects and adaptations

- Double Start originally pushed two `/setup` routes. It now uses
  `router.navigate`; the regression passed with the double tap retained.
- Debug LogBox could intercept taps; final checks use standalone Release.
- The first Release DEX merge failed with a 2 GiB heap. The build plugin's
  4 GiB heap passed the corrected Release build.
- Android Release originally blocked HTTP. The build plugin permits it only
  for an explicitly selected test channel; HTTPS disables cleartext, and an
  HTTP origin for a non-test channel stops configuration.
- Android keyboard dismissal uses Enter for the single-line search field.
  Goal clearing places the cursor after the text before Backspace.
- Goal assertions select the Android container's child text. Navigation,
  timer and finish actions use IDs or accessibility labels rather than
  iPhone coordinates where available.
- Timer subtraction is bounded and stops when the controls disappear. The
  mandatory reflection and return assertions remain: a fixed five-tap
  assumption was invalid because the adjustment step and remaining time vary.

## Commands and evidence

Evidence directory: [`../evidence/2026-10-07-android-critical/`](../evidence/2026-10-07-android-critical/).

- `npm run typecheck`: exit 0, `typecheck.log`.
- `npm test`: exit 0, `unit.log`; 51 unit-test files, including API transport policy.
- `npm run android -- --variant release --device Pixel_9_Pro_API_35 --no-bundler`:
  exit 0, complete final command output in `build.log`.
- Each flow was run as `maestro --device emulator-5554 test --test-output-dir
  <output> <flow.yaml>`. Per-flow command output: `navigation.log`,
  `finite-timer.log`, and `android-*.log`; all final exit codes and fingerprints
  are in `results.json`.
- The authenticated synthetic `/api/ai/question` request returned HTTP 200
  and nonempty text: `ai-connection.json`. Keys and response text were omitted.
- Native Settings opened the server-backed language catalog and showed the
  loaded translation: `native-catalog.json` and `catalog.png`.
- Saved answer and takeaway after relaunch: `journal.png`.

The new portable command is `npm run test:e2e:android:critical`. It runs the
same published scenario contents in the required order and prints its full
log/artifact directory. This wrapper was added after the recorded device runs;
its behavior was checked separately without repeating the device suite:
`runner-check.json` confirms all ten invocations in order on success and
immediate exit after the third flow's injected failure, without any retry.

## Limits

Android `main`, `rare`, prepared/stub and tablet suites were not run. The
modified original iOS navigation and finite-timer flows were not rerun on iOS.
The emulator was stopped after verification; its installed build and data remain.
