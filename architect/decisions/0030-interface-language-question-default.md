# ADR-0030: Use interface language for questions with undetermined prayer language

- Status: Accepted
- Date: 2026-09-14

## Context

An empty or ambiguous prayer topic may not provide enough information for the
server to determine the question language. The app already has an independent
English, Russian or Ukrainian interface preference.

## Decision

Add optional `default_language: 'ru' | 'uk' | 'en' | null` to the question
request contract. `completePrayerContent` reads the current `uiLanguage` from
settings immediately before sending each request. This shared transport path
covers first, next, replacement and reflection questions without duplicating
language arguments through the session and AI layers. Request limiting retains
the field, including explicit `null`; omitted values remain omitted.

Bible API owns language detection and uses the default only for an undetermined
result. Confidently detected languages keep their existing server behavior.
The client preserves topic and answer text and does not infer language itself.
Scripture language is independent. Existing prefetch keys include UI language,
so a language switch does not reuse a question prepared for another language.

## Consequences

Deploy the API contract before releasing this client: the previous request
model rejects unknown fields. HTTP 422 propagates from the transport; the client
does not remove the field or repeat the request for compatibility. Existing
AI-layer fallback handling remains outside this change.

This supersedes the request-metadata restriction in ADR-0021 and ADR-0022.
Stored questions and prayer content are never translated retroactively.

## References

- [Mobile task](https://app.clickup.com/t/86cbh47n3)
- [API prerequisite](https://app.clickup.com/t/86cbh47mf)
