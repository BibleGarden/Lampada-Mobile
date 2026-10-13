# Android final validation: audio busy and close labels

Checked on 2026-10-13–14 (MSK), completed at 00:16 on October 14. Source revision: `599c742` on `fix/audio-busy-close-labels` (Expo SDK 57). The continuation used HEAD `0589e32`, which only added this report. Device: `emulator-5554`, AVD `Pray_Pixel_API_35`; no physical device was targeted.

Release APK: `android/app/build/outputs/apk/release/app-release.apk`, SHA-256 `136eef3cd137a251aeb5a0b0a57539d798c9cc4485bbf1d883d4f5fb03ea07eb`. The installed APK survived the restart and was reused without rebuilding; its SHA-256 was verified to match. Installed APK test-channel and API-origin preflight passed.

| Check / flow | Result |
| --- | --- |
| `npm run typecheck`, `npm test` | Pass, exit 0 each (October 13) |
| Android prebuild, `assembleRelease` | Pass, exit 0 each (October 13) |
| `android-stage06-jrn-001-empty-history` | Pass after proven emulator failure and cold restart |
| `android-stage03-setup-start`, `android-stage03-navigation`, `android-stage03-session-finite`, `android-stage04-answers-text` | Pass, exit 0 each (October 13) |
| `android-stage06-end-001-finish-without-takeaway` | Pass, exit 0 |
| `android-stage06-end-002-finish-with-takeaway` | Pass, exit 0 |
| `android-privacy-consent-first-use` | Pass, exit 0 |
| `android-smoke-full` → `android-smoke-full-relaunch` | Pass, exit 0 each, preserved sequential order |
| Docked keyboard contracts: setup, answer, reflect, report, journal | Pass, exit 0; native bounds and restoration passed for all five forms, including answer save/reopen |
| Keyboard window resize | Pass, exit 0; focus, action bounds and answer save/reopen passed; display restored to 1280×2856, density 480 |
| `android-music-recording` | Pass, exit 0 |
| `android-music-toggle` | Pass, exit 0 |
| `android-settings-close-labels` | Pass, exit 0 |
| `android-ans-023-recordings-actions` | Pass, exit 0 |
| `android-answer-recordings-regression` | Pass, exit 0 |
| `android-stage04-unsaved-answer-swipe` | Pass, exit 0 |
| `android-music-finish-early` | Pass, exit 0 |
| `android-scripture-settings` | Pass, exit 0 |

Android critical is complete: all 10 scenarios, all five docked keyboard contracts and the resize contract passed across the original run and continuation. All eight targeted flows passed once each. No app failure was observed. No app code or version was changed.

## Environment evidence

The first critical attempt failed at `android-stage06-jrn-001-empty-history`, step 004 (`start-prayer-button` visibility), because a **Pixel Launcher not responding** system dialog covered Lampada's Home screen. Evidence: `critical/android-stage06-jrn-001-empty-history/2026-10-13_232118/android-stage06-jrn-001-empty-history/screenshots/step-004-assertCondition-start-prayer-button.png`. The AVD was cold restarted and the flow rerun under the documented environment exception; it passed. A premature invocation during that restart exited before any flow because adb reported the device offline.

On October 13, the load gate twice stopped before starting `android-stage06-end-001-finish-without-takeaway`; measured guest load reached 18.02, with host media analysis and browser processes active. Logs remain in `critical-after-environment-recovery/` and `critical-remainder/`. These were gate failures, not executed scenario failures.

The continuation cold booted the same AVD with normal priority (nice 0), retained the load threshold of 3 and three quiet samples, and extended the gate timeout to 1800 seconds. No build ran during validation. Remaining critical flows started at loads 0.51–1.00; targeted flows at 0.51–2.52. The longest targeted gate waits were 36 seconds before early music finish and 46 seconds before scripture settings. No continuation gate timed out and no continuation scenario was rerun. Completed flows from the original run were not repeated.

Full command logs, exit codes, per-flow results, native bounds and Maestro artifacts: `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/audio-final/`. Continuation artifacts use `continuation-critical`, `continuation-keyboard-docked`, `continuation-keyboard-resize` and `continuation-targeted`. The emulator was shut down and Gradle daemons stopped after validation.
