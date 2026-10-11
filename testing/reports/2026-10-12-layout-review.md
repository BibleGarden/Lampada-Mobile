# Layout review validation

- Date: 2026-10-12, Europe/Moscow.
- Branch: `fix/answer-question-label`, PR #45.
- Tested source: `c1ddd76bfbff1c975127b25e215c2247ba25f8fb` (the checked working tree was committed without further source changes).
- The owner's local `app.json` version change remains uncommitted.
- No native build was produced; Maestro and visual acceptance are deferred to the requested screenshot recapture.

| Command | Exit code | Result | Full log and exit artifact |
| --- | --- | --- | --- |
| `npm run typecheck` | 0 | TypeScript validation passed | [Log](../evidence/2026-10-12-layout-review/typecheck.log), [exit](../evidence/2026-10-12-layout-review/typecheck.exit) |
| `npm test` | 0 | 487 Node tests and 21 Python tests passed | [Log](../evidence/2026-10-12-layout-review/unit.log), [exit](../evidence/2026-10-12-layout-review/unit.exit) |
| `git diff --check` | 0 | No whitespace errors | Checked before committing |

The Python subprocess signal test deliberately interrupts its child process;
the resulting `KeyboardInterrupt` in the log is expected and the suite exits 0.
New helper tests cover short recording-overlay geometry, exact measured text
fragments, punctuation trimming, and strictly shorter ellipsis candidates.
The updated `LAY-001` through `LAY-009` rows define the remaining visual checks.
