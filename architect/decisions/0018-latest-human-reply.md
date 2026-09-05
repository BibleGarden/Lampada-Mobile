# ADR-0018: Send the latest human reply separately

- Status: Superseded by ADR-0019
- Date: 2026-09-05
- Participants: Mobile application owner and agent

## Context

The question endpoint receives a `user` string containing the topic, assistant
questions, human answers and generation instructions. Checking this entire
string for acute distress causes an old answer to trigger the same response on
subsequent turns. The server needs an unambiguous latest human reply.

## Decision

Use option B of the mobile task: retain the `user` context and add
`last_user_message`. The response remains `{ "text": "..." }`.

For question generation and reflection, answers are ordered by numeric question
index. Within each answer, trimmed typed text precedes completed transcripts in
recording order, joined with newlines. Empty components and empty turns are
omitted. The latest message is the final nonempty turn, with no assistant text,
topic or generation instructions. Skipping a question creates no human reply;
the latest actual reply stays the same. This is conversation order, not the
wall-clock order of edits to older answers.

The first question uses the trimmed topic alone. A later request with no shared
answers sends an explicit empty string, including when answer consent is denied.
Core consent still gates all prayer question requests; answer consent gates both
the historical answers and the separate latest reply, and is rechecked by the
transport. Scripture selection continues to use its existing flat reply list.

## Options considered

- Structured `messages`: makes roles explicit, but the proposed contract does
  not define how to preserve topic and first/next/reflection instructions without
  making those instructions look like the latest human reply.
- Separate `last_user_message`: chosen because it preserves the existing
  generation context and directly supplies the server's safety detector.

## Consequences

- The server can inspect the latest reply without parsing prose or old answers.
- Multiple recordings for one question are checked together as one human turn.
- The server must implement the new field before the end-to-end fix is effective.
  An explicit empty latest message must not fall back to scanning all of `user`.
- The historical `user` format remains prose: next-question prompts list questions
  under `Уже прозвучали вопросы:` and answers under
  `Что человек ответил (опирайся на это, но не цитируй дословно):`, using `— `
  bullets separated by newlines. Reflection uses `Его ответы во время молитвы:`.
  Previously every transcript was a separate bullet; now one answer is one bullet
  with its transcripts joined by newlines. These delimiters are not an escaping
  format and must not be treated as authoritative role boundaries.

## References

- [Mobile task](https://app.clickup.com/t/86cbegwbn)
- [Server task](https://app.clickup.com/t/86cbegmzz)
- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
