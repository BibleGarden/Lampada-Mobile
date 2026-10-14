# PR #54 Android device run — 2026-10-14

Tested source: `7fd672f25f9fb9a518e7d306698320d68c934b04` (`fix/wide-landscape-home` on `main` `2baf9d0`). The later commits on the branch change only documentation and this report. Standalone Release `1.3.61` (test channel) with `patches/@shopify+react-native-skia+2.6.2.patch` applied, APK SHA-256 `195b54bc800c500b213aa0c3cf24ce388dd31eb7d53fb6886d19c3bc7ab8c41f`, installed on `emulator-5554` (`Pray_Pixel_API_35`, Android 15, Russian locale, emulator started with normal CPU priority). Android only; no physical device was used. The installed APK was pulled back and its hash matched the built one.

## Density switch (LAY-014)

The unfolded Galaxy Z TriFold was emulated with `wm set-ignore-orientation-request true`, `am compat enable OVERRIDE_ANY_ORIENTATION_TO_USER` and `OVERRIDE_ANY_ORIENTATION` for `app.lampada`, `wm size 1584x2160` and landscape rotation. The app was started at density 520, and the density was switched to 400 while the app ran.

| Build | Home | Reflect |
| --- | --- | --- |
| `2baf9d0` (before) | lamp drawn ~1.3x too large, shifted right and down, bowl over the title: [`before-trifold-home.png`](../evidence/2026-10-14-skia-density/before-trifold-home.png) | ember right of the column centre: [`before-trifold-reflect.png`](../evidence/2026-10-14-skia-density/before-trifold-reflect.png) |
| `7fd672f` (after) | lamp centred, normal size, clear of the title: [`after-trifold-home.png`](../evidence/2026-10-14-skia-density/after-trifold-home.png) | ember centred: [`after-trifold-reflect.png`](../evidence/2026-10-14-skia-density/after-trifold-reflect.png) |

A cold start at density 400, a portrait phone (native 1280x2856 at 480) and a 10" tablet in portrait (1600x2560 at 320) looked the same before and after. No crash appeared in logcat after the density switch. The before Home shot is unlit and the after shot is lit because a test prayer was recorded in between.

## Critical gate

The emulator was first restored to defaults: `wm size reset`, `wm density reset`, `wm set-ignore-orientation-request false`, `am compat reset-all app.lampada`, portrait rotation.

| Run | Passed | Failed | Result |
| --- | ---: | ---: | --- |
| Android critical Maestro | 10 | 0 | Full smoke and relaunch passed. |
| Critical docked keyboard contracts | 5 | 0 | Setup, answer, reflection, report and journal passed. |
| Critical window resize | 1 | 0 | Bounds, focus, save/reopen and display restoration passed. |

The counted run is the second attempt. The first attempt passed all 10 Maestro scenarios, then the setup docked contract failed with `Expected docked, observed floating`. The cause was the test environment, not the app. Earlier `adb shell input text` and `keyevent` calls (the manual screen sweep) had left Gboard in its compact vertical toolbar instead of the docked keyboard: the IME inset was only the navigation bar strip `[0,2784][1280,2856]`. Restarting Gboard and re-selecting it as the input method did not restore the keyboard; rebooting the emulator did (IME inset `[0,1848][1280,2856]`). The gate was then run once more, as AGENTS.md allows for a proven environment cause. The app code tested is the same as `main`'s apart from the native Skia patch, and that patch does not touch input.

An earlier invocation of `npm run test:e2e:critical -- --device emulator-5554` was the wrong runner: it selects the iOS flows, and every flow failed at once with "Package twinkler is not installed". It is not counted.

Full logs and exits stay outside git at `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/pr54/`:

- the counted run: `critical-command.log`, `critical-command.exit`, `critical/`;
- the first attempt: `critical-attempt1-command.log`, `critical-attempt1-command.exit`, `critical-attempt1/`;
- the Gboard evidence: `env-gboard-toolbar.png`, `env-gboard-after-reset.png`, `env-gboard-after-reboot.png`;
- the wrong-runner attempt: `ios-tier-wrong-runner.log`, `ios-tier-wrong-runner.exit`.
