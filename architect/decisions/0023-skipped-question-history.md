# ADR-0023: Send skipped questions and respect server novelty

- Status: Accepted
- Date: 2026-09-06

## Context

Replacing an unanswered question overwrites its visible slot. The structured
conversation contains only answered turns, so repeated replacements previously
sent identical context. Bible API now accepts `skipped_questions` and returns an
optional `novel` flag after checking a generated question against known history.

## Decision

Keep replaced unanswered questions in session memory, clearing them on reset and
new prayer entry. Include this history and currently displayed unanswered
questions in next/reflection requests. The current question must already be in
the speculative replacement request because the client prefetches one question
ahead. Commit it to skipped history only after displaying its replacement.
Determine unanswered status from local answers before applying answer consent;
a voice answer without a finished transcript is still an answer.

Exclude assistant-message texts from skipped history. Send at most the latest
10 skipped entries in chronological order, capped at 300 UTF-16 code units each.
Keep the existing 40-message limit and share the 16,000-unit total budget with
skipped entries. Human conversation has priority over skipped entries. First
requests never send skipped history. Include skipped context in prefetch keys.

Preserve `novel` through the HTTP and AI layers. When replacement returns
`novel: false`, keep the current question and consume the failed slot without an
automatic retry loop. The next explicit tap can retry. When advancing from an
answered question, use a local fallback instead; first and reflection generation
also use local fallbacks. Missing `novel` preserves older-server behavior.

## Consequences

The server can compare against questions that were replaced without an answer.
The existing synchronous generating guard and stale-result checks remain in use.
No database migration or native dependency is required. The history belongs only
to the active prayer and is not persisted in the journal. Core consent still
gates the entire request; answer consent independently gates human replies.

Only the ten newest skipped entries that fit the remaining budget reach the
server, so older skipped questions can still recur. Local fallback pools are
finite and can repeat after their unused entries are exhausted. These limits do
not constitute a guarantee of semantic uniqueness.

## Validation

Node tests cover request limits, disjoint histories, first/reflection stages,
legacy responses, novelty propagation, repeated replacements, answer transitions,
rapid taps, explicit retry after non-novel results and reset during a request.
