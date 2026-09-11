# Answer sheet disappears after closing recordings

Investigated on 2026-09-11 in the iPad (A16), iOS 26.5 simulator.

## Diagnosis

The recordings sheet was closed correctly (index -1). The answer sheet still
reported index 0 and position 436.24 pt, but its native view retained the closed
1180 pt translation. Its input measured below the screen at y=1258.5 pt. The
answer backdrop remained at opacity 0.7, blocking the prayer screen.

These measurements came from the live Reanimated values, native input bounds
and an LLDB UIView hierarchy dump. The installed Reanimated 4.5.1 lacked the
settled-properties invalidation fix from
[upstream PR 9527](https://github.com/software-mansion/react-native-reanimated/pull/9527).

## Change

Upgrade Reanimated to 4.5.5, which includes that fix and supports the project's
React Native 0.86 and Worklets 0.10 versions. Both the package and lockfile are
pinned. No sheet remount, forced-close or backdrop suppression was added.
Temporary probes and layout experiments were removed.

The user's in-progress test answer and recording were saved locally before the
native rebuild, without starting AI requests. App documents were also backed up
outside the repository.

## Validation

- TypeScript: passed (exit 0).
- Native Debug build and install: passed (exit 0), with a duplicate `-lc++`
  linker warning. Build output: `/tmp/pray-reanimated-ios-build-source-expo.log`.
- Three native recordings-sheet open/close cycles passed after animations had
  settled, including playback/pause and opening recordings from the keyboard.
  The answer remained visible and accepted input after each return.
- Closing the answer removed its backdrop and restored the underlying screen.
- The user's saved recording and its audio file survived the install.

The regression check used the actual `AnswerSheet` and `RecordingsSheet` with a
temporary route, synthetic text and a generated silent WAV. Those temporary
files were removed after the check. Physical devices were not exercised.

Debug build validation required repairing the local RNCore artifact: the binary
matched the Release archive despite a missing build-configuration marker, which
made the native script incorrectly skip Debug extraction. After restoring Debug
with React Native's `replace-rncore-version.js`, Expo's precompiled core exposed
a C++ ABI mismatch at startup. Compiling Expo modules from source resolved it:

```sh
EXPO_USE_PRECOMPILED_MODULES=0 pod install --project-directory=ios
EXPO_USE_PRECOMPILED_MODULES=0 EXPO_PUBLIC_BUILD_CHANNEL=test npx expo run:ios --device 01D3DE05-E4B9-4F88-A4A2-5DE23B1F8739 --no-bundler
```

Dependency installation completed with npm audit advisories (14 moderate and
5 high) and a pending Skia install-script advisory; no broad audit fixes or
script approvals were applied for this change.

[Original blocked screen](../evidence/2026-09-11-recordings-dismiss/before.png)

[Answer restored](../evidence/2026-09-11-recordings-dismiss/answer-restored.png)

[Backdrop removed](../evidence/2026-09-11-recordings-dismiss/backdrop-cleared.png)
