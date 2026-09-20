# Prayer reminders (REM-001…015) — automated run 2026-09-20

Device: iPhone 17 Pro simulator (iOS 26.5), Release build 1.0.23.
The reminders have no Maestro flows before this run; the group is driven by
`testing/e2e/run-rem-fire.sh` (time-dependent steps cannot live in static
YAML: the editor steppers move 1 h / 5 min and their accessibility labels
embed the current time, so `testing/e2e/gen-rem-set-time.mjs` generates the
tap sequences, choosing the shortest direction — a forward-only path can
cross an already-taken time and the app's collision guard silently rejects
the shift).

Key environment finding: a delivered notification banner lives in SpringBoard
and never appears in the app's accessibility hierarchy, so Maestro cannot
assert on it. Firing is verified by device screenshots taken by the runner
at the scheduled minute (`xcrun simctl io booted screenshot`).

## Results

| ID | Result | Evidence |
|---|---|---|
| REM-001 | Passed | `ios-rem-001-permission-allow.yaml`: system prompt at the toggle moment (not at start), Allow → toggle on, schedule line; repeat toggle does not re-ask |
| REM-002 | Passed | `ios-rem-002-permission-deny.yaml`: Deny → toggle stays off, `reminders-permission-warning` shown, the rest of settings keeps working |
| REM-003 | Not run (hybrid) | granting via system Settings is manual per plan §10; earlier manual report 2026-09-02 covers the settings path |
| REM-004 | Passed | `REM-004-011-013-banner.png`: banner «Lampada — Пара минут тишины — и станет легче.» at the set minute, phrase from the pool |
| REM-005 | Passed | schedule line shows both times; `REM-005-first.png` (21:45) and `REM-005-second.png` (21:50) — a banner arrived at every set time |
| REM-006 | Passed | `ios-rem-006-restart.yaml`: schedule survives a cold start (WEEKLY triggers are system-owned); the two fired banners used different phrases |
| REM-007 | Not run (hybrid) | device reboot; manual per plan §10 |
| REM-008 | Passed | toggle off cancels: nothing scheduled, `assertNotVisible` on the pool phrases after the target minute, `REM-008-no-banner.png` |
| REM-009 | Not run (hybrid) | tapping a banner is SpringBoard UI, Maestro cannot reach it; manual per plan §10 |
| REM-010 | Not run (hybrid) | same as REM-009 |
| REM-011 | Passed | the REM-004 banner screenshot was taken with the app open in the foreground — the banner is shown, not silently dropped |
| REM-012 | Not run (hybrid) | ongoing prayer chronometer (Live Activity) alongside a reminder; manual per plan §10 |
| REM-013 | Passed | the REM-004 flow finishes a prayer first (Home shows «Огонёк горит»), the banner still arrives the same day — reminders are unconditional |
| REM-014 | Passed | `ios-rem-editor-suite.yaml`: first tap on a time/rule trash only arms (label switches to «Подтвердить удаление…», row stays), second tap deletes exactly the selected item |
| REM-015 | Passed | same suite: arming resets after 3 s timeout, on editor close, on editing the schedule, and arming another target cancels the previous one |

## Artefacts

- Flows: `testing/e2e/ios-rem-*.yaml`
- Runner/generator: `testing/e2e/run-rem-fire.sh`, `testing/e2e/gen-rem-set-time.mjs`
- Evidence: `testing/evidence/2026-09-20-reminders/`
- Logs: `/tmp/rem-editor-run7.log` (suite, exit 0), `/tmp/rem-001-run4.log` (exit 0), `/tmp/rem-002-run3.log` (exit 0), `/tmp/rem-fire-run17.log` (exit 0)

## Defects

None found.
