# PR #53 Android device run — 2026-10-14

Tested source: `b3e01f7daa037b78ec4bc9e0c94527757e72849d` (`feat/ru-default-bti`, rebased on `main` `e7550ef`, which includes PR #52). Standalone Release `1.3.60` (test channel), APK SHA-256 `5ea90592dede044b3413362059e179f8dc478ace7145e2785b60b15d098525ba`, installed on `emulator-5554` (`Pray_Pixel_API_35`, Russian locale, emulator started with normal CPU priority). Android only; no physical device was used.

The build used the ordinary test API from `.env.local` (a live catalog), which is what every flow in this run requires: the default-language flow reads the real Russian translation catalog, and the critical tier and the saved-choice flow need no stub.

| Run | Passed | Failed | Result |
| --- | ---: | ---: | --- |
| Android critical Maestro | 10 | 0 | Full smoke and relaunch passed. |
| Critical docked keyboard contracts | 5 | 0 | Setup, answer, reflection, report and journal passed. |
| Critical window resize | 1 | 0 | Bounds, focus, save/reopen and display restoration passed. |
| `android-scripture-default-language` | 1 | 0 | Fresh install, Russian: Settings shows Russian / BTI / Никита Семёнов-Прозоровский. |
| `android-scripture-user-choice-overrides-locale` | 1 | 0 | The saved Russian / SYNO / Александр Бондаренко choice survives a relaunch. |

No failures; nothing was rerun. The first critical invocation exited before starting any flow because `apkanalyzer` was not on the shell `PATH` (a host environment error, no app involvement); it was started again once with the SDK `cmdline-tools` directory added, and that is the run counted above.

Selected evidence: [`default-language.png`](../evidence/2026-10-14-ru-default-bti/default-language.png) (Settings after the fresh-install flow, showing the BTI translation and the Семёнов-Прозоровский narrator).

Full logs and exits stay outside git at `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/pr53/`: `build.log`, `critical-command.log`, `critical/`, `default-language-command.log`, `user-choice-command.log` with corresponding `.exit` files, and `critical-command-pathfail.log` for the aborted first attempt.
