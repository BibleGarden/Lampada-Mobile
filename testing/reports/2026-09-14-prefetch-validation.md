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
value is included in this report or evidence. OpenAPI declares `prefetch` for
both endpoints. The following synthetic requests were each sent once:

| Request | Result |
| --- | --- |
| Question: empty topic, `default_language: "uk"`, `prefetch: true` | HTTP 422, `extra_forbidden` at `body.default_language` |
| Scripture: Ukrainian, empty topic, `prefetch: true` | HTTP 429, `prefetch_disabled`, no `Retry-After` |

The deployed question API lacks the interface-language field required by local
main. Server-side prefetch denial works for Scripture, but the integrated
question request is rejected before admission. The client was not modified to
drop the field, and the failed request was not retried.

The API deployment must combine interface-language and prefetch support before
live question flows can be verified. No server configuration or deployment was
changed. The SE simulator was not replaced with this branch while the live
question contract is incompatible.

Evidence: [API responses](../evidence/2026-09-14-prefetch-validation/api-responses.json).
