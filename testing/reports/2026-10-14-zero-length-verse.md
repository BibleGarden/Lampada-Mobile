# PR #52 Android device run — 2026-10-14

Tested source: `19564747138f82b74d4e72352f82d3d73e1534c3` (`fix/zero-length-verse-timings`). Standalone Release `1.3.60`, APK SHA-256 `5cb7ea1b29646e939066036896386a871e1a6e7c6d2cecc8615ea8609cdf638b`, installed on `emulator-5554` (`Pray_Pixel_API_35`, Russian locale). The installed package was non-debuggable and its test API metadata passed preflight. Android only; no physical device was used.

| Run | Passed | Failed | Result |
| --- | ---: | ---: | --- |
| Android critical Maestro | 10 | 0 | Full smoke and relaunch passed. |
| Critical docked keyboard contracts | 5 | 0 | Setup, answer, reflection, report and journal passed. |
| Critical window resize | 1 | 0 | Bounds, focus, save/reopen and display restoration passed. |
| Scripture narration resume/cancel | 1 | 0 | Playing, pause, resume and passage replacement states passed. |
| Scripture long reader | 1 | 0 | Reader and favorite navigation passed. |
| Scripture navigation | 0 | 1 | After rapid Next/Prev, the card showed a retry icon instead of a passage; the favorite-active assertion failed. The first Next had loaded a passage. The selection failure's HTTP/storage cause was not exposed by logcat. No crash; this flow was not rerun. |
| Closest-equivalent playing capture | 1 | 0 | Psalm 118:89–108 showed Pause while playing; MP3 decoder creation and AudioTrack activity were recorded. |

**SCR-034 live result: unverified.** The app has no passage search, picker or deep link for Proverbs 18:1–25; its server selects the next passage. A direct request through `fetchScriptureAudioClip` to the production API (translation 1, voice 1) returned HTTP 403 at the book catalog, before verse alignment could be checked. The test-channel build played the closest available passage above, without “Нет озвучки”. Verse 8/9 highlight and completion at verse 25 were not observed. SCR-029–033 fault-injection paths were not exercised on this normal build; the available narration flow exercises their shared playback path only.

Selected evidence: [`playing.png`](../evidence/2026-10-14-zero-length-verse/playing.png). Full logs and exits remain outside git at `/private/tmp/claude-501/-Users-maria-Desktop-Dev-cep-pray/5c3bfe2f-1cc9-48b5-9a76-c02a9c0c3c65/scratchpad/e2e/logs/pr52/`: `build-test.log`, `critical-command.log`, `critical/results.tsv`, `narration-resume-command.log`, `scripture-flows-command.log`, `reader-flow-command.log`, `live-command.log`, `codec-start-excerpt.log`, `live-logcat-full.log`, and `live-api-probe.log` with corresponding `.exit` files. No failed test was rerun.
