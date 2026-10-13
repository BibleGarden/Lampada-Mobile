# Android reflection fit — 2026-10-14

**Fit PASS; owner visual approval pending. Full Android critical gate FAIL
(readiness timeout, not an app assertion).** No reflection clipping defect or
app crash was observed. App source and `app.json` were not changed.

- Tested source: `fa264d2307d8a7d1e7f5a5972e1e8e2bd95bb74d`, branch `fix/reflect-short-screens`, base `main` `269209d`.
- Lampada 1.3.59, Expo SDK 57, standalone Release, `EXPO_PUBLIC_BUILD_CHANNEL=test`.
- Release: prebuild + `assembleRelease`, installed SDK, ARM JDK 23; Gradle stopped before Maestro.
- APK SHA-256: `e433e7b755654533002ec08f3ac12a4f26f190fcdb42775d57d31d4b5db9a4b8`.
- Device: only `emulator-5554`, AVD `Pray_Pixel_API_35`; no physical device operated.
- Artifact root: `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad`.
  `reflect-shots/` contains all 10 PNGs; `e2e/logs/reflect-fit/` contains full
  command logs/exit codes, fixtures, flows, native hierarchies/window snapshots,
  `screenshot-summary.json`, environment samples and cleanup evidence.

## Screenshots and native bounds

Each prefix has `-typical.png` (52 characters) and `-long.png` (155 characters).
Existing store mock; custom fixtures/flows outside git; no scrolling before screenshots.

| Condition / PNG prefix | Display / navigation | Both buttons fully visible | Result |
| --- | --- | --- | --- |
| a / `a-normal-gesture` | 1280×2856 / 480 dpi / gesture | Yes | PASS |
| b / `b-short-gesture` | 1080×1920 / 405 dpi / gesture | Yes | PASS |
| c / `c-short-three-button` | Same short display / three-button | Yes | PASS |
| d / `d-short-gesture-keyboard-closed` | Same as b, keyboard closed again | Yes | PASS |
| e / `e-short-gesture-keyboard-open` | Same as b, docked Gboard | No, deferred by the compact contract | PASS |

Native hierarchy and OS insets confirm complete button rectangles above navigation:
b return bottom 1814 < navigation top 1859; c return bottom 1753 < navigation top
1798, for both questions. Complete sits above return. In d, input/return bounds
match b exactly; complete also matches for the typical question and differs by
one physical pixel at its lower edge for the long question. No persistent smaller
layout remains. In e, the input fits above IME and both actions are absent.

## Checks

- `npm run typecheck` and `npm test`: PASS, exit 0 each.
- Release prebuild/build and installed APK test metadata validation: PASS.
- END-006 takeaway keyboard, reflection/journal keyboard, END-003/004 idempotency:
  PASS, one invocation each (`targeted/`).
- END-009: PASS, one external controlled flow with the existing stub and a
  20-second question delay (`end-009/`); no committed Android END-009 flow exists.
- Reflect docked open / native geometry / Enter restore and journal persistence:
  PASS, one invocation each (`reflect-contract/`).
- `npm run test:e2e:android:critical`: exit 1, run once, no retry. All 10 main
  critical flows passed; setup native geometry/restore and answer geometry passed.
  Answer restore was **not started** by the load gate; later critical native
  phases and window-resize contract were not run. The generic requested
  `test:e2e:critical` targets iOS in this revision, so its documented Android
  counterpart was used with explicit `ANDROID_TEST_DEVICE=emulator-5554`.

## Readiness and cleanup

Default load thresholds were preserved. Answer restore timed out after 295 s;
last samples: 4.52, 5.20, 5.02, 4.70, 4.88, 4.89. Full failure:
`critical/keyboard-contract-docked/android-keyboard-contract-answer-restore.log`
and `critical-run.log`. One following sample showed SurfaceFlinger at 130% and
Lampada at 39.3%; earlier samples were largely idle. The workload cause remains
unresolved. No failed scenario or critical suite was rerun. The previously
unstarted reflect contract ran separately after closing the leftover answer editor.

Environment logs record host GPU, 4 vCPUs, 4 GB RAM, qemu nice 0 and host/guest
processes, power and disk. Before flows, an incompatible JDK and an APK install
before the package service were corrected. The emulator disappeared after its
launching shell exited; one cold recovery kept it in a foreground session.

Original size/density/navigation/demo state restored; emulator shut down;
Gradle stopped; temporary stub/local environment removed. Crash buffer empty,
no crash signatures in logcat. App code/version unchanged; report only; no PR.
