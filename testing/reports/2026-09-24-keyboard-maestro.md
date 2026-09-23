# Keyboard Maestro flows — 2026-09-24

Work for [ClickUp 86cbj8b62](https://app.clickup.com/t/86cbj8b62) on
`test/keyboard-flows`, based on `origin/main` at `f81a75b`. The checks used the
local iOS Release build on the named iOS 26.5 simulators. The evidence below
was collected on 2026-09-23 and 2026-09-24 (Europe/Moscow).

## Coverage

| Scenario | Flow | Device |
| --- | --- | --- |
| SETUP-004 | `ios-stage03-long-goal.yaml`, `ios-ipad-setup-004-keyboard-margins.yaml` | iPhone, iPad |
| ANS-024 | `ios-answer-recordings-regression.yaml` | iPhone |
| ANS-032 and answer sheet dismissal | `ios-ans-032-recordings-keyboard.yaml` | iPhone |
| END-006 | `ios-end-006-takeaway-keyboard.yaml`, `ios-ipad-end-006-takeaway-rotation.yaml` | iPhone, iPad |
| Reflection and journal search dismissal | `ios-keyboard-reflect-journal.yaml`, `ios-ipad-keyboard-journal-answer.yaml` | iPhone, iPad |

The flows use the system keyboard's `shift` and `inputView` accessibility IDs
to check visibility and placement. The answer sheet handle gained a test ID;
there was no visual app change. The reminder editor footer report has no text
input, and the test plan has no reminder-editor keyboard scenario.

## Results

| Check | Result and evidence |
| --- | --- |
| New iPhone END-006 | Exit 0 on 2026-09-24: [full Maestro log](../evidence/2026-09-24-keyboard-maestro/phone-end-006.log). |
| iPhone critical tier | Exit 0, 11/11 flows on 2026-09-24: [full Maestro log](../evidence/2026-09-24-keyboard-maestro/phone-critical.log). |
| iPad group before the final assertion edits | Six flows passed on 2026-09-23. ANS-023 then failed because the XCTest driver connection was refused during a tap; this was not an app assertion: [group log](../evidence/2026-09-24-keyboard-maestro/ipad-group.log), [driver error](../evidence/2026-09-24-keyboard-maestro/ipad-driver-failure.txt). |
| Static checks | `npm run typecheck`, `git diff --check`, and parsing all 119 Maestro YAML files: exit 0 on 2026-09-24: [commands and exit codes](../evidence/2026-09-24-keyboard-maestro/checks.txt), [typecheck output](../evidence/2026-09-24-keyboard-maestro/typecheck.log). |

The new phone END-006 command was
`maestro --device "$(testing/e2e/sim-udid.sh 'Pray Smoke iPhone 17 Pro')" test --test-output-dir "${TMPDIR:-/tmp/}pray-e2e-output" testing/e2e/ios-end-006-takeaway-keyboard.yaml`.
The critical command was `npm run test:e2e:critical`.

Claude's earlier individual phone flows reached their final assertions in the
saved logs, but their process exit codes were not preserved. They are not
counted as confirmed passes here. The iPad SETUP-004 long-goal assertion and
the iPad END-006 regex were edited after the group run, so the final versions
are **not yet verified**. The group was not retried because project rules
require explicit permission after a failed test run.

The iPad END-006 run before the assertion edit captured the
[landscape keyboard](../evidence/2026-09-24-keyboard-maestro/ipad-end-006-landscape-keyboard.png)
and the [actions after dismissal](../evidence/2026-09-24-keyboard-maestro/ipad-end-006-landscape-actions.png).
Its later assertions check the original phrase and added markers separately:
the caret position after refocusing the field is layout dependent, so those
assertions do not prove an exact final character sequence. Exact text retention
is asserted in the phone END-006 and iPad SETUP-004 flows.
