# ADR-0031: Let the server admit AI prefetch

- Status: Accepted
- Date: 2026-09-14

## Context

Preparing questions and scripture before the user requests them reduces latency
but spends API capacity on content that may never be displayed. The server needs
independent switches and quotas for this background work.

## Decision

Mark speculative question and scripture request bodies with `prefetch: true`.
User-requested generation omits the field. This includes distinguishing the first
scripture request made while its panel is hidden from opening the panel.

Treat HTTP 429 with `detail: "prefetch_disabled"` or
`detail: "prefetch_limit_exceeded"` as an empty background result, without a UI
error, retry or local replacement. Other failed prefetches also produce no
content. Keep empty question/reflection slots until consumed or invalidated by
new context so timer ticks cannot form a retry loop. Demand arriving during
pending prefetch waits for that result and, if empty, makes an ordinary request.

Foreground handling, consent gates, model selection and provider policy remain
unchanged. The server owns admission configuration; the app does not estimate
spending or implement a separate budget policy.

## Consequences

A denied warmup trades latency on subsequent demand for reduced API spending.
This requires an updated app: older builds send unmarked requests that the
server cannot distinguish from user demand. Deploy the API change before the
mobile release because older servers reject the new field with HTTP 422.
The deployed question API must also retain `default_language` support from
ADR-0030. Both fields are sent together in the integrated client.
No native dependency, persistent
storage change or migration is required.

## Validation

Focused Node tests exercise both refusal codes, request marking at all prayer
stages, no local replacement or background retries, timer deduplication, and
foreground requests after pending question, reflection and scripture denials.
TypeScript checking covers all affected client call sites.
