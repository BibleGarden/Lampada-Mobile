# Local validation of server-controlled AI prefetch

Date: 2026-09-14
PR: https://github.com/BibleGarden/Lampada-Mobile/pull/2
Original PR head: `e14668794de8d7ff63862faf0c17b6760f7f9a48`
Local base: `main` at `f3204c3e470d0e34e3eea88ff3122051d47b17cd`

## Integration

Fetched the PR into `codex/prefetch-validation` and rebased it onto local main.
Resolved conflicts in request types and architecture documentation while keeping
both `default_language` and `prefetch`. Renumbered the prefetch decision to
ADR-0031 because ADR-0030 already describes the interface-language contract.
Adapted the language integration tests to assert the prefetch marker and added a
test through the real session, AI and transport modules with controlled HTTP
responses. No remote branch was rewritten or pushed.

## Client verification

The existing tests cover both admission refusal codes, silent denied background
requests, no automatic retries, retention of an empty reflection result across
timer ticks, and user demand arriving during first/next question, reflection
and Scripture prefetches. The added integration test verifies first, replacement,
next and reflection demand after both refusal codes, with the language metadata
preserved and no local question substitution or warning for a policy refusal.

Final verification on 2026-09-14:

- `npm test`: exit 0, 203 passed, no failures or skips.
- `npm run typecheck`: exit 0, no diagnostics.
- `git diff --check`: exit 0.
- Full test and typecheck logs inspected; no warnings.
- The repository has no configured CI workflow; these results are local.

## Configured API verification

Used the API origin and limited key from the existing `.env.local`; neither
value is included in this report or evidence. Before the server restart, the
following synthetic requests were each sent once:

| Request | Result |
| --- | --- |
| Question: empty topic, `default_language: "uk"`, `prefetch: true` | HTTP 422, `extra_forbidden` at `body.default_language` |
| Scripture: Ukrainian, empty topic, `prefetch: true` | HTTP 429, `prefetch_disabled`, no `Retry-After` |

That deployment lacked the interface-language field required by local main.
The client was not modified to drop the field, and the failed request was not
retried before the server changed.

Initial evidence: [API responses](../evidence/2026-09-14-prefetch-validation/api-responses.json).

## Verification after the server restart

On 2026-09-14 after 09:11 UTC, OpenAPI confirmed both `default_language` and
`prefetch` in the question contract. A live harness then exercised the actual
`ai.ts`, `llm.ts` and `scriptureClient.ts` modules from this branch. Native
settings were replaced with explicit consent for synthetic test content and
Ukrainian UI language; HTTP requests used the configured API without mocks.
Each row below is one request, with no automatic or manual retry:

| Flow | Background request | Ordinary request |
| --- | --- | --- |
| First question | HTTP 429, `prefetch_disabled` | HTTP 200, Ukrainian question |
| Next question | HTTP 429, `prefetch_disabled` | HTTP 502, `AI service unavailable` |
| Reflection | HTTP 429, `prefetch_disabled` | HTTP 200, Ukrainian question |
| Scripture | HTTP 429, `prefetch_disabled` | HTTP 200, parsed Ukrainian selection from `safe_pool` |

All question requests retained `default_language: "uk"`; ordinary requests
omitted `prefetch`. The real client classified background refusals as empty
results (`null` for questions and `prefetch_denied` for Scripture), without a
local replacement or retry. The next-question HTTP 502 followed existing
foreground error handling and returned a bundled fallback question; the live
assertion correctly failed on that response. Only the remaining, unexecuted
reflection and Scripture scenarios were run afterward.

The contract incompatibility is resolved and live prefetch admission behavior
works with background generation disabled. The next-question generation check
did not pass because of the server's HTTP 502; its cause was not established.
Enabled prefetch and quota exhaustion remain covered by local tests rather than
this deployment, whose prefetch policy was not changed. No application code,
server configuration or deployment was modified during this follow-up, and the
SE simulator was not reinstalled.

Evidence: [OpenAPI fields](../evidence/2026-09-14-prefetch-validation/openapi-after-restart.json)
and [eight live responses](../evidence/2026-09-14-prefetch-validation/api-after-restart.json).
