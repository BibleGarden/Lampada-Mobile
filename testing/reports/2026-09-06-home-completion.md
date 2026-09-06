# Prayer completion returns directly Home

## Behavior

After `complete` resolves, reflection dismisses the keyboard and returns Home,
removing the prayer flow from the stack. Home displays the localized saved notice
for four seconds and consumes its route parameter. The takeaway remains in the
journal. The legacy done route redirects Home without a confirmation message.

## Simulator verification

Pray SE, iOS 26.5, English interface. A temporary local fixture created one test
session named `QA completion navigation` and opened the real reflection screen.
No AI request was needed. The fixture was removed after the check.

- Entered a takeaway and selected Save and finish.
- Observed Home directly, the lit flame, and `Prayer saved`.
- Verified the notice disappears after four seconds without navigating away.
- Opened Prayer history and observed the test session with its saved takeaway.

The notice expiry was also replayed independently after hot reload to distinguish
timer behavior from development reloads. One synthetic completed session remains
in the simulator journal. No physical-device run was performed.

## Checks

- `npm run typecheck`: exit 0, full output reviewed, no errors or warnings.
- `git diff --check`: exit 0.
- English, Russian and Ukrainian notice strings are provided.
- Existing completion flows and the test plan now expect Home directly. Maestro
  flows were updated but not run during this change.
