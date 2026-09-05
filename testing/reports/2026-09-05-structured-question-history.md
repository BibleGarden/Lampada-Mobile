# Structured question history (option A)

Task: https://app.clickup.com/t/86cbegwbn

The client sends `{ topic, stage, messages }` for first, next and reflection
questions. See [ADR-0019](../../architect/decisions/0019-structured-question-history.md)
for the complete server contract, empty-history semantics and limits.

## Validation

- `npm test`: exit 0; 148 passed, no failures or skipped tests.
- `npm run typecheck`: exit 0; no diagnostics.
- Full output reviewed from `/tmp/pray-structured-tests.log` and
  `/tmp/pray-structured-types.log`; no warnings on the final runs.
- Covered chronological question/answer pairing, skipped and blank answers,
  multiple transcripts and voice-only replies, all three stages, empty history,
  40-message and 16,000-character budgets, oversized latest-reply rejection,
  renewed distress after a normal reply, and consent withdrawal before transport.
- Wire tests intercept requests from the real AI and HTTP modules, with mocked
  settings and fetch; no prayer content was sent externally.

## Integration boundary

The server must support `topic`, `stage` and empty `messages`, select the stage's
prompt, and use the final user message for the strongest distress rule (the topic
is initial human input only for `first`). No server deployment, physical-device
installation or live end-to-end check was performed. Response validation remains
unchanged. Option B is superseded and is not sent by the client.
