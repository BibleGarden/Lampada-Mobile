# Android final validation: audio busy and close labels

Checked on 2026-10-13 (MSK). Source revision: `599c742` on `fix/audio-busy-close-labels` (Expo SDK 57). Device: `emulator-5554`, AVD `Pray_Pixel_API_35`; no physical device was targeted. The Release APK was built with the test channel at `android/app/build/outputs/apk/release/app-release.apk`; SHA-256: `136eef3cd137a251aeb5a0b0a57539d798c9cc4485bbf1d883d4f5fb03ea07eb`. Installed APK metadata passed the test-channel and API-origin preflight.

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm test` | Pass (exit 0 each) |
| Android prebuild, `assembleRelease` | Pass (exit 0 each) |
| Android critical scenarios | 5/10 passed; remaining 5 not started after guest-load gate failures |
| Docked keyboard and window-resize contracts, including answer keyboard restore | Not started: critical runner stopped at its first gate failure |
| `android-music-recording`, `android-music-toggle`, `android-settings-close-labels`, `android-ans-023-recordings-actions` | Not started: emulator remained overloaded |
| `android-answer-recordings-regression`, `android-stage04-unsaved-answer-swipe`, `android-music-finish-early`, `android-scripture-settings` | Not started: emulator remained overloaded |

The first critical attempt failed at `android-stage06-jrn-001-empty-history` because a **Pixel Launcher not responding** system dialog covered Lampada's visible Home screen. Its Maestro screenshot is in `critical/android-stage06-jrn-001-empty-history/2026-10-13_232118/.../screenshots/step-004-assertCondition-start-prayer-button.png`. This proves an emulator failure, so the AVD was cold restarted and the flow was rerun under the documented environment exception; it passed. A premature invocation during the restart exited before any flow because adb reported the device offline.

After recovery, `android-stage06-jrn-001-empty-history`, `android-stage03-setup-start`, `android-stage03-navigation`, `android-stage03-session-finite`, and `android-stage04-answers-text` each passed. Before `android-stage06-end-001-finish-without-takeaway`, the guest-load gate timed out twice without starting that flow. Measured load was 7.28 during the first wait and 18.02 after the second; host `mediaanalysisd` and Chrome processes were active. No app-caused failure was observed, but final Android E2E validation is incomplete. No app code or version was changed.

Full command logs, exit codes, per-flow results, and Maestro artifacts: `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/audio-final/`. The emulator was shut down and Gradle daemons stopped after the run.
