# Latest human reply contract

Historical option B report, superseded by [the option A report](2026-09-05-structured-question-history.md).

Task: https://app.clickup.com/t/86cbegwbn

Implemented option B: question requests include `user` and
`last_user_message`. Human turns are ordered by question index. A turn combines
typed text and completed recordings with newlines. Empty answers and unfinished
transcripts contribute no text. The first request isolates the topic; subsequent
and reflection requests isolate the last permitted answer. No permitted answer
means an explicit empty latest message.

## Validation

- `npm test`: exit 0, 146 tests passed, no failures or skipped tests.
- `npm run typecheck`: exit 0, no diagnostics.
- Full test and typecheck output reviewed; no warnings.
- HTTP requests intercepted locally through the actual AI generation and
  transport modules; no prayer content sent to an external service.
- Covered an old distress phrase followed by a normal reply, renewed distress,
  multiple recordings, voice-only answers, blank answers, chronological ordering,
  first and reflection requests, and transport checks after consent withdrawal.

## Remaining integration check

Server task https://app.clickup.com/t/86cbegmzz was still `to do` when inspected.
No live-server or device check was performed. Once deployed, verify that the
server uses only `last_user_message` for the strongest distress rule, including
when it is explicitly empty, and that an ordinary subsequent reply reaches the
model. Existing response validation and local fallback behavior are unchanged.
