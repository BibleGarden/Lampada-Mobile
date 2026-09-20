# First-ever run of the 12 untouched flows 2026-09-20

The inventory (86cbj8udw) listed 13 flows that had never been executed. One of
them (`privacy-consent-first-use`) was already fixed and verified in the
critical run (see `2026-09-20-critical-run.md`); the remaining 12 were run for
the first time on the "Pray Smoke iPhone 17 Pro" simulator against a local
Release build.

## Results

| Flow | First run | Final |
|---|---|---|
| stage05-privacy-setting | Failed (stale) | Passed after fix |
| privacy-audio-consent | Failed (stale) | Passed after fix |
| stage05-ai-timeout | Passed | Passed |
| stage05-ai-success-payload | Passed | Passed |
| stage05-ai-opt-in-payload | Failed (stale) | Passed after fix |
| stage05-ai-late-response | Failed (no env) | Excluded from tiers — see below |
| answer-recordings-persistence | Passed | Passed |
| answer-recordings-regression | Passed | Passed |
| scripture-audio-resume-cancel | Passed | Passed |
| stage06-scr-003-long-reader | Failed (stale) | Passed after fix |
| stage04-unsaved-answer-swipe | Failed (flaky) | Passed after fix |
| stage07-jrn-share-001 | Failed (order) | Passed after fix |

No app bugs found. One app change was made for testability (not a fix):
`components/CompanionDock.tsx` gained `testID="dock-scripture-prev"` /
`testID="dock-scripture-next"` on the scripture pager SquareButtons — the
coordinate taps (78%,89% / 82%,86%) stopped hitting the target after the dock
redesign and testIDs are stable against layout shifts. Requires the 2026-09-20
rebuild of the simulator app.

## Notable fixes

- `stage05-ai-late-response` is a one-line fragment (`assertVisible: "Ответить"`)
  that only makes sense inside an active prayer session with a delayed AI
  response (previously driven by a local https mock, evidence 2026-08-22-stage05).
  Running it standalone can never pass. The `main` tag was removed so the tier
  planner skips it; it moves to the stub-run phase (task 86cbj95j4).
- `stage07-jrn-share-001` depended on journal data left by other flows and on an
  evidence dir that did not exist. It is now self-sufficient (creates its own
  prayer with an answer), closes the iOS 26 share sheet by tapping the dimmed
  area (there is no Cancel button anymore), and writes evidence to
  `evidence/2026-09-20-journal-share/`.
- `stage04-unsaved-answer-swipe`: the "Точно закрыть?" confirmation window lives
  3 s, shorter than Maestro's tap→assert delay; replaced the two-step confirm
  with `doubleTapOn: "Отмена"`. The main ANS-003 scenario (swipe keeps the draft)
  was verified passing before this failure.
- `stage06-scr-003-long-reader`: scripture tab is opened via
  `dock-scripture-tab`; after adding, the button reads «В избранном»; the
  hardcoded passage «Луки 15:11-24» was replaced by a load check («Слушать»)
  because the passage list depends on the live server response.

Environment notes: after the macOS reboot the XCTest driver starts reliably
with `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000` (now baked into all
`test:e2e:*` scripts). An unexplained app reinstall happened on the simulator
at 12:03 (twinkler-1789895006222.app) from outside this session; the app was
rebuilt again at 12:20 from the working copy to pick up the testID change.

Full logs: `/tmp/e2e-batch1/*.log` (kept in /tmp per evidence policy).
