# AI content reports

Verified on 2026-09-19 against the report contract introduced by Bible-API
task 86cbj7pf0.

The answer sheet exposes a report action for the currently displayed generated
question. The full scripture reader exposes the same action for the current
passage. Both open one localized confirmation dialog with an optional comment.
The request contains only the generated text, its kind, the interface language
and that comment; it never reads the prayer topic or the person's answer.

Network and timeout failures keep the dialog and comment available for retry.
Opening or retrying a report does not mutate the unsaved answer. A successful
request shows an explicit confirmation. The saved journal deliberately has no
report action because it presents generated questions beside private answers;
reporting remains on the two generation screens where the transferred boundary
is clear.

- `npm test` passed (exit 0), including the content-report transport contract.
- `npm run typecheck` passed (exit 0).
- `git diff --check` passed (exit 0).

The native visual flow still requires the normal human check in an installed
build after the server endpoint is deployed. No simulator or physical-device
claim is made by this report.
