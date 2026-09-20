# Stage 02 closure report: Technical build risks — 2026-09-20

- Date: 2026-09-20
- Commit: 307e1e9 ("Merge pull request #4 from BibleGarden/test/e2e-refresh-2026-09-20")
- Scope: the P1 risk from `testing/TEST_PLAN.md` §3 (Main risks):
  > **P1 — Native module errors — Skia, Reanimated, Gesture Handler, SQLite and Expo Audio in a custom build.**
- Build under test: local custom iOS Release build (a development client / standalone build, NOT Expo Go — Expo Go lacks some of the project's native modules), installed on the "Pray Smoke iPhone 17 Pro" simulator (iOS 26.5); the e2e runs referenced below are documented in the same-day reports listed in each section.
- Method: this report assembles existing evidence only. No Maestro flow was re-run and the simulator was not touched for this closure; the source-level checks (typecheck, unit tests, expo-doctor) were re-run fresh on 2026-09-20 and are quoted with exit codes.

Verdicts at a glance:

| Risk | Verdict |
|---|---|
| Skia in a custom build | Covered |
| Reanimated in a custom build | Covered |
| Gesture Handler in a custom build | Covered |
| SQLite in a custom build | Covered indirectly (see the explicit note below) |
| Expo Audio in a custom build | Covered |

## 1. Skia (`@shopify/react-native-skia` 2.6.2)

- What the risk was: the Skia native module fails to load, crashes, or renders incorrectly in a custom build (it is not available in Expo Go, so a broken custom build would only show it).
- Where it is used: `components/Flame.tsx` (the flame on Home / the done screen) and `components/ScreenBg.tsx` (the background canvas) — i.e. every screen render exercises Skia.
- Covering flows: `testing/e2e/ios-smoke-full.yaml` and `ios-smoke-full-relaunch.yaml` (cold start, Home with the flame, session, reflect, done), plus every stage03 navigation flow, all of which render the Skia background/flame on each screen.
- Evidence:
  - `testing/reports/2026-09-20-critical-run.md`: smoke-full Passed (after flow fix), smoke-full-relaunch Passed ("persistence confirmed"), stage03-navigation Passed, stage03-session-finite Passed — a full prayer cycle with the Skia flame and background rendering on every screen, no native errors.
  - Fresh `npm run typecheck` 2026-09-20: exit 0, no errors.
- Conclusion: Skia loads and renders correctly in the custom Release build. **Covered.**

## 2. Reanimated (`react-native-reanimated` 4.5.5 + `react-native-worklets` 0.10.1)

- What the risk was: worklets/UI-thread animations fail in a custom build (babel plugin / worklets registration issues typical of custom dev-client builds).
- Where it is used: animated layout and transitions across the app (`app/_layout.tsx`, `app/threshold.tsx`, `app/session.tsx`, `app/reflect.tsx`, `app/journal.tsx`, `app/settings.tsx`, `app/setup.tsx`, `app/favorites.tsx`, `app/about.tsx` — 11 import sites in 9 files), including the hold-to-start progress and the timer/flame animation.
- Covering flows: `testing/e2e/ios-stage03-navigation.yaml`, `ios-stage03-setup-start.yaml`, `ios-stage03-session-finite.yaml`, `ios-stage03-session-infinite.yaml`, `ios-stage03-deep-links.yaml`, `ios-stage03-long-goal.yaml`, smoke-full / smoke-full-relaunch (full cycle with all animated transitions), and the lock flows (animated PIN screens).
- Evidence:
  - `testing/reports/2026-09-20-critical-run.md`: stage03-navigation, stage03-setup-start, stage03-session-finite, smoke-full, smoke-full-relaunch all Passed; the only failures in the group were stale flow asserts, explicitly "No app bugs found in this group".
  - `testing/reports/2026-09-20-rare-run.md`: stage03-long-goal Passed after a wording fix (flow-only).
  - Fresh `npx expo-doctor@latest` 2026-09-20: 20/21 checks passed; the single failed check is patch-version drift (see the commands section), and for reanimated the *installed* version 4.5.5 is newer than the doctor's expected 4.5.1 — no incompatibility.
- Conclusion: all animated transitions run in the custom build across the full navigation and prayer cycle. **Covered.**

## 3. Gesture Handler (`react-native-gesture-handler` 2.32.0)

- What the risk was: the gesture system (hold-to-start, bottom-sheet drags, swipe gestures) misbehaves in a custom build — the classic missing `GestureHandlerRootView` or RNGH/native-screens interplay problems.
- Where it is used: the hold-to-start gesture on the threshold screen (`app/threshold.tsx`), `@gorhom/bottom-sheet` sheets, and the swipe/unsaved-answer interactions (stage04).
- Covering flows: `testing/e2e/ios-stage03-setup-start.yaml` and `ios-stage03-start-*.yaml` (full hold creates exactly one session; short hold cancels), `ios-stage04-unsaved-answer-swipe.yaml` (sheet swipe + confirmation), `ios-smoke-full.yaml` (SMK-003 hold-cancel / hold-full), and the lock PIN flows (tap gestures on the PIN pad).
- Evidence:
  - `testing/reports/2026-09-20-critical-run.md`: stage03-setup-start Passed after a flow-wording fix; smoke-full Passed (covers SMK-003).
  - `testing/reports/2026-09-20-untouched-flows-run.md`: stage04-unsaved-answer-swipe Passed after fix (flaky assert, no app bug).
  - `testing/reports/2026-09-20-rare-run.md`: lock-suite flows pass (PIN pad taps).
- Conclusion: hold, cancel, swipe and tap gestures behave correctly in the custom build. **Covered.**

## 4. SQLite (`expo-sqlite` 57.0.2) — Covered indirectly

- What the risk was: native SQLite errors in a custom build — e.g. a DB error at session start leaving the button blocked forever (START-004 in the plan).
- Direct flows: `testing/e2e/ios-stage03-start-sqlite-lock.yaml`, `ios-stage03-start-sqlite-retry.yaml` and the `ios-stage03-start-sqlite-lock-prepare.yaml` helper.
- **Explicit status: these flows are NEEDS-ENV and were NOT passing as of 2026-09-20.** They verified DB-error handling in August via an external `BEGIN EXCLUSIVE` lock. The app has since moved to `PRAGMA journal_mode = WAL` (`lib/db.ts:60`): an external exclusive transaction, `locking_mode=EXCLUSIVE` and read-only file permissions all fail to block the app's WAL writers (verified empirically, three methods — see `testing/reports/2026-09-20-stub-run.md`, section "sqlite-lock / retry: mechanism changed, NEEDS-ENV"). The app code path under test — the generic catch in `app/threshold.tsx:102` showing «Не удалось начать молитву» with a working retry — is unchanged, but forcing the error now needs a test hook. Tracked in ClickUp task 86cbj95j4; the fragments stay untagged. These flows must not be cited as passing.
- What covers the SQLite risk instead (indirect coverage):
  1. All journal/lock flows passing **on the real WAL-mode SQLite database**: the ordered `ios-jrn-suite.yaml` (7 flows: search, details, audio playback, cascading delete — all green per `testing/reports/2026-09-20-main-run.md`), the lock flows (consent decisions restored from versioned SQLite records, e.g. lock-002/003/004/005), `ios-smoke-full-relaunch.yaml` (data survives force-quit — critical run), `ios-answer-recordings-persistence.yaml` and `ios-answer-recordings-regression.yaml` (recordings rows + files persist — untouched-flows run). This proves the native SQLite module works correctly in the custom build for every real operation the app performs.
  2. Fresh unit tests 2026-09-20: **215 passed / 0 failed** (exit 0), including the storage/state logic tests over the DB layer.
  3. The documented mechanism change: the original risk scenario (external lock blocking the writer) is architecturally impossible under WAL, recorded in `testing/reports/2026-09-20-stub-run.md` with the three empirical methods.
- Conclusion: the native SQLite module is proven healthy in the custom build by all real-usage flows and unit tests; the synthetic external-lock error injection is not currently reproducible (NEEDS-ENV, tracked). **Covered indirectly.**

## 5. Expo Audio (`expo-audio` 57.0.4)

- What the risk was: the audio native module fails in a custom build — recording/playback crashes, players not released, music and recording interfering.
- Where it is used: background music player, voice recording, scripture narration, journal audio playback.
- Covering flows: `ios-music-toggle.yaml`, `ios-music-finish-early.yaml`, `ios-music-timer-finish.yaml`, `ios-background-music.yaml` + `ios-background-music-resume.yaml` (chained in `ios-background-suite.yaml`), `ios-scripture-audio-resume-cancel.yaml`, the narration steps of the scripture flows, `ios-stage06-jrn-006-audio-switch.yaml` (journal audio), `ios-answer-recordings-persistence.yaml`, `ios-answer-recordings-regression.yaml`, `ios-stage06-jrn-005-prayer-a.yaml` (recordings sheet).
- Evidence:
  - `testing/reports/2026-09-20-main-run.md`: all fixable main-tier flows pass individually or in suites, including the music flows (music-timer-finish was fixed to wait for natural expiry — flow-only change) and the jrn suite; audio checks use the `scripture-audio-button` testID (Maestro full-string label matching — flow-only note).
  - `testing/reports/2026-09-20-rare-run.md`: background-suite (music → music-resume → timer-setup → timer-resume) exit 0 — background/foreground with audio in the custom build.
  - `testing/reports/2026-09-20-untouched-flows-run.md`: answer-recordings-persistence Passed, answer-recordings-regression Passed, scripture-audio-resume-cancel Passed on first-ever run.
  - `testing/reports/2026-09-20-stub-run.md`: scripture flows with narration (context-privacy, context-main, context-fallback, highlight) all Passed against the stub build.
- Conclusion: recording, playback, music switching, backgrounding and player release all work in the custom build. **Covered.**

## Fresh source-level checks (re-run 2026-09-20, commit 307e1e9)

- `npm run typecheck` (`tsc --noEmit`): **exit 0**, no errors. (PRE-002 of the plan.)
- `npm test` (unit tests, `node --test lib/__tests__/*.test.mjs`): **exit 0 — 215 passed / 0 failed / 0 skipped**, duration ~1.2 s.
- `npx expo-doctor@latest`: **20/21 checks passed, exit 1.** The single failed check is "packages match versions required by installed Expo SDK": 22 packages sit one-to-few patch versions behind the SDK 57 expected range (e.g. `expo` 57.0.18 vs ~57.0.24, `expo-sqlite` 57.0.2 vs ~57.0.3, `expo-audio` 57.0.4 vs ~57.0.5); `react-native-reanimated` is 4.5.5, *newer* than the doctor's expected 4.5.1. Per the task instructions nothing was changed or fixed for this report; this is recorded as-is. The failure is patch-drift only and does not indicate an SDK-57 incompatibility (PRE-003 nuance).

## Summary

| Risk (TEST_PLAN §3, P1) | Verdict | Key evidence |
|---|---|---|
| Skia in a custom build | Covered | smoke-full / smoke-full-relaunch / stage03 flows Passed (critical-run report); every screen renders the Skia flame/background |
| Reanimated in a custom build | Covered | all stage03 navigation flows + smoke + lock flows Passed across critical/main/rare reports; expo-doctor shows no incompatibility (4.5.5 newer than expected) |
| Gesture Handler in a custom build | Covered | hold-to-start (setup-start, smoke SMK-003), sheet swipe (stage04-unsaved-answer-swipe), PIN pad — all Passed |
| SQLite in a custom build | Covered indirectly | sqlite-lock/retry are NEEDS-ENV (WAL, lib/db.ts:60 — NOT passing, do not cite as pass); covered by all journal/lock flows passing on real WAL SQLite, 215/215 unit tests, and the documented mechanism change (stub-run report) |
| Expo Audio in a custom build | Covered | music/background/scripture-audio/journal-audio/recording flows all Passed (main, rare, untouched-flows, stub reports) |

Closure statement: no native-module defect was found in the custom Release build for any of the five P1 risk areas. The only open item is the NEEDS-ENV test hook for synthetic SQLite error injection (ClickUp 86cbj95j4); it is a test-infrastructure gap, not an app defect.
