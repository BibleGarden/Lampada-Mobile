# iOS Simulator smoke run - 2026-08-21-22

- Status: **Passed**
- Coverage: PRE-001 to PRE-004 and SMK-001 to SMK-007
- Source commit: `55fcc72de02c241b57b988fb75715c10581f77b9`
- Fix: uncommitted changes to `package.json` and `package-lock.json`

## Outcome

After the Expo SDK 57 dependencies were aligned, the app was built and installed
successfully and passed the full smoke scenario on a clean iOS Simulator.

The final uninterrupted run created exactly one prayer, finished early after 20
seconds out of the planned 300. The text answer, the takeaway and the streak day
stayed in SQLite and were shown in the journal after a force stop and relaunch.

## Environment

- macOS 26.5.2 (`25F84`)
- Xcode 26.6 (`17F113`)
- Node.js 24.18.0
- npm 11.16.0
- Expo 57.0.15
- React Native 0.86.2
- Expo Modules Core 57.0.12
- Hermes `250829098.0.16`
- Maestro 2.6.1
- `Pray Smoke iPhone 17 Pro`, iOS 26.5 (`23F77`)
- UDID: `05F697B7-36CD-4050-9D57-FC9316AA093C`
- Release, `iphonesimulator`, arm64

## Fixing the launch blocker

The original Release build crashed 3 times out of 3 during dynamic linking: Expo
FileSystem 57.0.5 expected `BaseModule.willDestroy`, which was missing from Expo
Modules Core 57.0.2. The dependencies were aligned with the official
`npx expo install --fix` inside SDK 57. In addition `react-dom 19.2.3` was pinned
explicitly to match React, so that npm would not pick the incompatible peer
`react-dom 19.2.8`.

After the update a clean Pods installation and a clean Release build in a fresh
DerivedData were performed. The app code was not changed.

## Preparatory checks

| ID | Status | Result |
|---|---|---|
| PRE-001 | Passed | `npm install`, exit code 0; the lock file was updated |
| PRE-002 | Passed | `npm run typecheck`, exit code 0 |
| PRE-003 | Passed | `expo install --check`, exit code 0; Expo Doctor 21/21, exit code 0 |
| PRE-004 | Passed | a clean `pod install` and a Release `xcodebuild`, exit code 0; `BUILD SUCCEEDED` |

The Release build:

```text
/tmp/pray-fix-sdk57/DerivedData/Build/Products/Release-iphonesimulator/Lampada.app
```

The full build log: `/tmp/pray-fix-sdk57/xcodebuild-release.log` - 58,525 lines,
exit code 0, 0 errors. A first noisy summary counted 2,796 warnings. A later
classification of the full reproducible Release log identified 1,466 warning
entries: 1,403 from Pods, 55 from generated iOS/Hermes code, 8 from the
environment and the toolchain, and 0 from the project's own native code. The
build is not declared "warning-free".

## Results of SMK-001 to SMK-007

| ID | Status | Actual result |
|---|---|---|
| SMK-001 | Passed | a cold start shows the home screen; the process does not crash, there are no new crash reports |
| SMK-002 | Passed | the goal `Финальный smoke` and 5 minutes are shown on the threshold screen |
| SMK-003 | Passed | a hold of 450 ms was cancelled; a hold of 1,700 ms created exactly one session |
| SMK-004 | Passed | the answer `Финальный ответ` was saved; the action changed to `Изменить` |
| SMK-005 | Passed | the session was finished after 20 seconds out of 300; the takeaway `Финальный вывод` was shown on the success screen |
| SMK-006 | Passed | the journal shows the prayer, the question, the answer and the takeaway |
| SMK-007 | Passed | after a force stop and relaunch the UI and SQLite hold the same data and the streak day `2026-08-22` |

The final Maestro flow and the separate relaunch flow both exited with code 0.

## Verification of the local data

Before and after the relaunch the result was identical:

```text
sessions: id=1, topic=Финальный smoke, planned_minutes=5,
          elapsed_sec=20, takeaway=Финальный вывод
answers:  session_id=1, question_index=0, text=Финальный ответ
prayed_days: 2026-08-22
```

The files `final-db-before-relaunch.log` and `final-db-after-relaunch.log` are
identical (`cmp` exit code 0).

## Defects

- BUG-001 - the SDK 57 dependencies and the Hermes regression: **Fixed /
  Verified**.
- BUG-002 - the Release build crashes on launch: **Fixed / Verified**.

No new product defects within SMK-001 to SMK-007 were found after the fix. The
npm audit warnings (10 moderate, 4 high) and the native build warnings need a
separate analysis and do not automatically count as confirmed user-facing bugs.

## Evidence

Directory: `testing/evidence/2026-08-22-ios-simulator/`

- `final-SMK-001-cold-launch.png` … `final-SMK-007-relaunch.png`;
- `maestro-full-final.log` and `maestro-full-final-relaunch.log`;
- `final-db-before-relaunch.log` and `final-db-after-relaunch.log`;
- `expo-install-check-after.log`, `expo-doctor-after.log`, `typecheck-after.log`;
- `pod-install-clean.log`, `xcodebuild-summary.txt`, `final-exit-codes.txt`.

## Limits of this result

The run confirms only SMK-001 to SMK-007 on a single iOS Simulator. The
microphone, real audio, haptics, a physical iPhone, Android, accessibility,
offline and AI errors and the extended scenarios from `TEST_PLAN.md` are not
covered by this result.
