# Android and iOS regression verification — 2026-10-08

Four application defects were reproduced and repaired: Android report actions
covered by the keyboard, a repeated Home tap activating Setup Next, Android
lock content remaining exposed in the instrumented native hierarchy, and a
transcription error pushing Retry outside the journal card. Each repair has an
affected-device check; the shared navigation and journal repairs also have iOS
checks. No Lampada app crash was observed by the guarded runners.

## Environments and revision

Branch: `codex/android-release-acceptance`, based on fresh `main` `57eb9e5`
(PR 36). The dated results are local device checks, not CI. GitHub's workflow
inventory returned zero workflows on 2026-10-08.

- Android: `Pray_Pixel_API_35`, Pixel 9 Pro profile, Play Store ARM64 Android 15
  API 35; Emulator upgraded from 35.2.10 to 37.2.12. Russian locale, Gboard,
  logical viewport preserved by 480×1071 / density-180 overrides.
- iOS: `Pray Smoke iPhone 17 Pro` and `Pray iPad2`, iOS 26.5; standalone Release.
- Normal API: the dedicated test origin `http://192.168.127.133:9084`.
- Controlled Android API: `http://10.0.2.2:9085`; iOS: `http://localhost:9085`.
  Prepared builds include `EXPO_PUBLIC_FORCE_SESSION_ERROR=1`.

Evidence directory: [`../evidence/2026-10-08-android-ios/`](../evidence/2026-10-08-android-ios/).
All files in that directory and its `android/{main,rare,prepared,ordered}` subdirectories
belong to this report. Per-scenario logs are complete command outputs; JSON
manifests identify commands, exits, source revisions and observed failures.
Raw build, system, failed-attempt logs and private binaries remain in
`/tmp/pray-android-2026-10-08/`; they are not committed.

## Coverage and build boundaries

This is an aggregate verification across diagnosed repairs, **not one replay of
every scenario on a single final SHA**. Broad groups ran before later defects
were found; their successful results were retained, affected scenarios ran on
corrected builds, and every new build received its critical gate. Version-only
and test-only commits after a build do not change its application source.

| Check | Verified result and boundary |
| --- | --- |
| TypeScript and unit suite | Exit 0; 331/331 tests after the final journal layout repair |
| Android normal critical | 10/10 on 1.3.18 after navigation, and 10/10 on 1.3.20 after lock isolation |
| Android main | All 33 identifiers have a final successful result; aggregate on 1.3.12–1.3.17 with corrected native test fixtures; subsequent app repairs have targeted checks and new critical gates |
| Android rare | 4/4 on normal 1.3.18, including narration resume/cancel, translation labels, long reader and Share |
| Android lock and reminder editor | PIN enable/unlock/change/disable, real short/long background return, forgotten-PIN cancellation/wipe and editor checks passed on 1.3.20; constituent flows are documented below |
| Android controlled phase | All 16 identifiers passed across 1.3.21–1.3.22 after the journal repair; zero orphaned recordings and native legacy-favorite seeding/migration verified |
| iOS normal critical | 10/10 on 1.3.19 after navigation |
| iOS main and rare | 32/32 and 4/4 on normal 1.3.19 |
| iOS ordered groups | Four groups passed on normal 1.3.19: journal, PIN, forgotten-PIN and background music/timer |
| iPad | 7/7 keyboard/rotation/recording scenarios and report keyboard/send check on 1.3.13; that binary predates the navigation and journal repairs |
| iOS reminder editor | Exit 0 on 1.3.13 |
| Latest controlled critical | 10/10 on Android 1.3.22 and iOS 1.3.23, both containing the final journal repair |
| iOS journal repair | Error/Retry and successful retry both exit 0 on controlled 1.3.23 |

Final normal **Android 1.3.24 and iOS 1.3.25** contain all four repairs and both
passed their restored normal critical gates (**10/10 each**). Android's final
normal PIN and forgotten-PIN groups passed; the corrected reminder-editor
invocation also passed. The full ordered command stopped at that editor's
fixture failure and is retained as nonzero, rather than described as one green
command. Final iPad RPT-006 passed on 1.3.25 after simulator-route recovery.

The latest application behavior change is `d089382`; subsequent source commits
change test inputs, documentation or reserved versions. `results.json` records
app-source hashes and exact invocation revisions. The normal test configuration
was restored, the local stub stopped, the instrumentation helper removed and
all used emulators/simulators shut down.

## Application repairs and evidence

1. **Report keyboard.** Android used no avoidance behavior in a transparent
   modal. `height` keeps the scrollable comment and fixed Send/Cancel footer
   above Gboard; iOS retains `padding`. RPT-006 checks keyboard placement,
   exact draft retention after dismissal, renewed editing and successful send.
   Evidence: `report-fix-verified.*`, `ios-report-fix-verified.*`,
   `ipad-report-keyboard-localized.*` and their selected screenshots.
2. **Repeated navigation.** The second Start tap could hit Next at the same
   position while Setup appeared. Next is disabled during the 350 ms Stack
   entrance, and Threshold navigation is idempotent. The Android and iOS
   navigation checks retain double taps, single-level Back and draft reset.
3. **Android lock isolation.** A native modal window excludes covered
   native-stack content and prevents Android Back dismissal (ADR-0037).
   Wrong PIN leaves the lock present and Home absent; correct PIN restores the
   original screen. `lock-window-verified.*` and the ordered checks verify this.
4. **Transcription Retry.** The error text now takes the available flex space
   and wraps; Retry retains its own width. Android JRN-012a/b passed with the
   actual failed server response and successful repeat. iOS error/retry passed
   on the final shared layout. Evidence: `android-transcription-error-fixed-*`
   and `ios-transcription-{error,retry}-verified.*`.

## Test and environment failures

All intermediate nonzero exits remain in the results manifest. They are not
counted as passing. The owner authorized further retries only when an
infrastructure cause was confirmed.

- An Android ANS-024 run ended during input after guest ADB reported a transport
  write failure and Maestro's RPC stream closed. Native app input had arrived;
  the app remained alive. The explicitly approved repeat passed after the
  emulator update.
- Maestro Unicode `inputText` switches to its own IME and back. In focus tests
  this left Gboard visible although React Native reported no input focus.
  A numeric control passed; genuine Russian Gboard key input passed the entire
  ANS-032 scenario on the original AnswerSheet. Speculative app changes were
  reverted. Focus fixtures now use ASCII or real Gboard keys; Cyrillic
  persistence coverage remains.
- Android provides untimed timer text and its caption as separate nodes.
  The corrected check also proves that the elapsed counter increases.
- Cold-start deep links require an explicit Home readiness assertion.
- The abandoned-session fixture now clears data only at its initial launch;
  its stop/relaunch still preserves data for the actual check.
- Live scripture ordering does not guarantee that the fourth passage is long.
  Reader fixtures select an expandable passage with bounded navigation.
- Android's underlying card report button could share coordinates with the
  reader header; the reader assertion is scoped to its actual action parent.
- iPad's success message was English; RPT-006 accepts the three supported
  interface translations without weakening draft or keyboard assertions.
- On final iPad 1.3.25, native CFNetwork recorded `NSURLErrorDomain -1009` and
  `unsatisfied (No network route)`. Authenticated host requests returned 200 for
  a question and 201 for a report. Restarting the same simulator restored the
  route; the unchanged RPT-006 binary passed.
- Reminder-editor setup now waits for the mandatory fresh-install consent
  button. Separate accessibility assertions/taps could exceed the three-second
  delete-confirmation window; the test still checks the first stage and expiry,
  then performs the two taps together and verifies removal.
- Plain Java sleep strings did not execute in the current GraalJS runtime.
  Explicit wall-clock waits verified 10,599 ms and 70,009 ms for LOCK-007.
- Two Android native build commands compiled successfully but exited nonzero
  during installation after emulator GPU/ADB failures. The same APKs were
  installed after environment recovery; they were not rebuilt to conceal the
  failure. One iOS build/install command timed out opening Expo's URL; direct
  bundle launch succeeded, and later ordinary commands exited 0.

The stopped Android lock parent recorded successful PIN members 001–005 before
its invalid background wait. The corrected LOCK-007, forgotten-PIN group and
reminder editor passed separately; those constituents establish the aggregate
ordered result without reporting that stopped parent as exit 0.

## Release database checks

A signed instrumentation helper reads/seeds the Release SQLite database
without root or enabling Debug. Host and native guards reject physical devices;
native code also requires explicit test-channel metadata and a non-production
API origin. Its certificate matches the local Release APK. The actual query,
zero orphan count and legacy-favorite migration were verified.

## iPad configuration correction

The initially installed physical iPad 1.3.9 combined the production origin with
the existing test key. An authenticated diagnostic returned 403 from production
and 200 with a nonempty question from the test API. Corrected 1.3.11 was built
and installed with the accepted test origin/key pair; bundled configuration was
verified without exposing the key. The owner confirmed that server questions
worked. This was a deployment configuration mistake, not an app-source repair.

## Limits

Physical Android devices, physical biometric authentication, Android App Switcher snapshot privacy, subjective sound
quality and full manual accessibility acceptance were not verified. Android
tablet/rotation coverage and a new real old-version Android upgrade were not
run. The retained broad-suite results predate some targeted fixes as identified
above; no single-final-revision full-suite or CI success is claimed.
