# Android setup Next label verification — 2026-10-14

Tested commit: `fa7a40ac89846920f05758ad8b8a67ba001007d5` on
`fix/setup-next-label-size`, rebased on `e15812e`. The original fix `7182268`
is `1c8b017` after rebase; `fa7a40a` updates its documentation.
App code and app.json version were not changed during verification.

Release APK: `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/next-font/lampada-fa7a40a-release.apk` (version 1.3.59).
SHA-256: `f66a5dcfc41fb2b6a6726151337a39e75fc9908dbde5fbedef14a760d859ad6a`.
Built with Android prebuild and `./gradlew assembleRelease`,
`ANDROID_HOME=$HOME/Library/Android/sdk`, `EXPO_PUBLIC_BUILD_CHANNEL=test`.
The ignored local environment was copied from the main checkout; required
variables, non-production API and installed test metadata were verified.
Local environment values are withheld and redacted from text artifacts.

Device: only `emulator-5554`, AVD `Pray_Pixel_API_35`, Android 15/API 35,
Russian primary locale, host GPU, 4 vCPUs, 4 GB RAM, nice 0. All device
commands used an explicit serial. Gradle was stopped before Maestro.

## Results

| Check | Result |
| --- | --- |
| npm run typecheck | PASS (exit 0) |
| npm test | PASS (exit 0) |
| Android prebuild / assembleRelease / install | PASS (exit 0 each) |
| android-keyboard-contract-setup-open | PASS |
| android-keyboard-contract-setup-restore | PASS |
| android-stage03-long-goal | PASS |
| android-stage03-setup-start | PASS |
| Android critical | PASS: 10 flows, 5 docked geometry/restoration contracts, native window resize/save/reopen |
| Scratch repro: default 1280×2856 / 480 dpi | PASS: 10/10 |
| Scratch repro: 1080×1920 / 405 dpi | PASS: 10/10 |

The repository's `npm run test:e2e:critical` selects iOS flows from
`testing/e2e/`. This Android-only verification used
`ANDROID_TEST_DEVICE=emulator-5554 npm run test:e2e:android:critical`
instead; the command distinction was raised with the owner before running.
The setup-start and setup contract flows also run inside the mandatory critical
gate; each explicitly requested targeted flow ran once before that gate.

## Label comparison

The scratch Maestro flow relaunches and clears app state, opens setup, inputs
an ASCII goal with docked Gboard, asserts the Next footer is absent, dismisses
Gboard by tapping setup-kicker, waits for the footer and captures a screenshot.
All 20 screenshots were compared using native TextView bounds, dark text pixel
bounds and SHA-256 of the label crop, and inspected in a contact sheet.

| Display | TextView frame | Text ink | Offset from button center | Distinct label crop hashes |
| --- | --- | --- | --- | --- |
| Default, 10 captures | 182×78 px | 179×55 px | (0, 0) px | 1 |
| 1080×1920 / 405, 10 captures | 153×66 px | 150×46 px | (-0.5, 0) px | 1 |

Wrong size or centering: **0/20**. Label crops are pixel-identical within each
display group. The density-scaled dimensions agree between groups.
This sample did not reproduce the intermittent tiny label; it does not establish
that an intermittent defect can never occur. No Lampada crash was observed.

## Environment and artifacts

Full logs, exit codes, APK, screenshots and scratch scripts are outside git:
`/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/next-font/`.
Selected indexes: `targeted/results.tsv`, `critical/results.tsv`,
`repro-results.json`, `label-comparison.json`, `label-contact-sheet.png`.
Per-attempt directories contain the original screenshot, label crop and hierarchy.

The first detached emulator launch did not leave a running process; no flow
started. A foreground-managed cold boot then passed the normal 120-second boot
gate. Guest quiet gates ran before every flow without relaxed thresholds.
Host evidence records nice 0 and idle mediaanalysisd at boot; flow logs retain
start/end guest loads. No cold reboot for a stuck load gate was needed.

Scratch capture 01 passed (exit 0) and saved its screenshot. A subsequent
auxiliary `adb shell uiautomator dump` failed with exit 137:
`UiAutomationService ... already registered` in the uiautomator process, while
Maestro still owned accessibility. Evidence: `repro-failure-crash.log` and
`repro-default-01-dump.exit`. The app remained alive; capture 01 was retained,
not rerun. A read-only `maestro --device emulator-5554 hierarchy
--no-reinstall-driver` succeeded; the remaining 19 captures used that method.
`repro-run.exit` records the auxiliary failure, `repro-continue.exit` is 0.

Display size/density were restored to 1280×2856 / 480. The emulator was shut
down and `./gradlew --stop` ran again (both exit 0). No PR was opened.
