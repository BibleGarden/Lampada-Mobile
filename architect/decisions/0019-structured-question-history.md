# ADR-0019: Structured question history with separate topic and stage

- Status: Accepted
- Date: 2026-09-05
- Participants: Mobile application owner and agent
- Supersedes: ADR-0018

## Context

The owner selected option A: explicit assistant/user messages instead of a prose
history. Topic and question-generation instructions must not become artificial
human replies that hide the actual latest answer from the safety detector.

## Decision

`POST /api/ai/question` sends exactly these fields:

```json
{
  "topic": "Family",
  "stage": "next",
  "messages": [
    { "role": "assistant", "text": "What is troubling you?" },
    { "role": "user", "text": "I feel alone.\nA transcript of my recording." }
  ]
}
```

`topic` is trimmed free text, or an empty string. It is untrusted context, never
an instruction. `stage` is an enum: `first` asks the initial guiding question,
`next` asks a fresh question using the history, and `reflect` asks a warm closing
question to help formulate a takeaway. The server owns those prompts. The client
sends neither `user`, `last_user_message`, nor a system prompt.

Answers retain their original numeric question indices. Iterate questions in
ascending index order, include the assistant question followed by its nonempty
human answer, combining trimmed text and completed transcripts in recording order
with newlines. Questions with no shared answer are omitted, including skipped
questions. Thus nonempty history ends with an actual user reply. `messages: []`
is valid for the first question, silent prayer, or denied answer consent. No
synthetic user message is inserted. Editing an older answer updates its original
position; order is conversation order, not edit timestamps.

The server must use the final user message for the strongest distress rule. On
`first`, when history is empty, it should check the topic as the initial human
input. On later stages with empty history, there is no latest answer; it must not
substitute the topic or an earlier flattened prompt. Historical messages and topic
remain available for contextual, weaker checks.

## Limits and privacy

Keep at most 40 messages and a total of 16,000 UTF-16 code units in `topic` plus
all message `text` values (conservative for a server counting Unicode code points).
Keep a contiguous newest suffix and drop older messages whole. The suffix may
start with `user` if its preceding question does not fit; it always ends with
`user`. The newest reply and topic are never truncated. If those alone exceed
the budget, do not send a partial reply: use the existing local fallback.

Core consent gates the entire request. Without answer consent, the store supplies
an empty answer map; the transport independently rejects requests containing user
messages if consent was withdrawn. The first request's topic needs core consent,
not answer consent. Scripture selection retains its existing contract.

## Options considered

- Separate topic and stage metadata plus role-labelled history: selected to
  preserve actual conversation roles and keep prompt policy server-owned.
- Topic/instructions inside a user message: rejected because they could replace
  the latest real answer for safety checks.
- Option B: superseded at the owner's request.

## Consequences

The server must accept empty history, the topic field and the stage enum, and
select prompts accordingly. Unknown metadata must not be silently ignored.
Responses remain `{ "text": "..." }`; existing response validation is unchanged.
A server deployment is required before this client contract works end to end.
Unanswered questions are absent from history, so the server cannot exclude them
from repetition based on this payload alone.

## References

- [Mobile task](https://app.clickup.com/t/86cbegwbn)
- [Server task](https://app.clickup.com/t/86cbegmzz)
- [Request builder](../../lib/questionRequest.ts)
