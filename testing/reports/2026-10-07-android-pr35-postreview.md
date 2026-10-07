# PR #35 post-review verification — 2026-10-07

All three review findings were addressed. All **10 Android critical scenarios**
passed on standalone Release **1.3.5**, Pixel 9 Pro API 35 (Android 15, x86_64).
The full unit suite and TypeScript passed on Node **22.23.3**.

## Changes and proof

1. **Installed APK configuration gate.** The build plugin records the explicit
   channel and normalized API origin in the native manifest without the key.
   Before any Maestro launch or data clearing, preflight pulls the installed
   base APK and reads that manifest offline. It requires a test channel and an
   origin matching the expected local test configuration. The production host,
   including HTTP or non-default ports, is rejected. Missing or duplicate
   metadata and store/stale APKs fail explicitly. The temporary APK is removed
   on success and failure.
2. **One-tap smoke assertion.** The Android smoke no longer taps the answer
   button a second time. Its required input assertion passed after one tap.
3. **Visible preflight failures.** The output directory is printed before
   environment validation. A failing validator's complete diagnostic and exit
   code are preserved and shown. Missing tools are also reported explicitly.

Seven controlled runner checks cover matching configuration, store release,
old APK, wrong API, production API, invalid environment and a failing flow.
The five rejected configuration cases started no scenarios. The success case
ran ten in order; an injected third-flow failure stopped after three without
retry. A real installed Release 1.3.4 lacking metadata was rejected before any
scenarios; no production requests were performed in these rejection checks.

## Evidence

Directory: [`../evidence/2026-10-07-android-pr35-postreview/`](../evidence/2026-10-07-android-pr35-postreview/).

- `results.json`: all ten final exit codes, exact source/flow fingerprints,
  installed 1.3.5 metadata and verification environment.
- `runner-contract.json`: seven controlled runner cases and invocation counts.
- `old-apk-rejected.log`: actual offline rejection of the old installed APK.
- `build.log`: full final output of `npm run android -- --variant release
  --device Pixel_9_Pro_API_35 --no-bundler`, exit 0.
- `runner.log` and `android-*.log`: full final output of
  `npm run test:e2e:android:critical` and all scenarios, exit 0.
- `typecheck.log` and `unit.log`: `npm run typecheck` and `npm test`, exit 0.

The final runner verified metadata from the installed APK before starting the
suite. No app/flow source changed after that recorded run. Keys and APK binaries
are excluded from the published evidence.

Android main/rare/prepared/tablet suites and iOS were not run in this follow-up.
