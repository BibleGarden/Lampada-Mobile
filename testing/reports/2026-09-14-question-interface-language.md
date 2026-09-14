# Interface language in prayer question requests

Date: 2026-09-14
Task: https://app.clickup.com/t/86cbh47n3

`completePrayerContent` adds the current interface language to every prayer
question request as `default_language`. The serializer preserves this metadata
while applying the existing conversation limits. Scripture preferences remain
independent.

## Validation

- Targeted Node tests (`llm`, `questionContext`, `questionSession`): exit 0,
  11 passed, no failures or skips.
- `npm test`: exit 0, 194 passed, no failures or skips.
- `npm run typecheck`: exit 0, no diagnostics.
- Full test and typecheck output reviewed; no warnings.
- Real session, AI and HTTP modules exercised with mocked settings, native
  boundaries and fetch. Verified first, next, replacement and reflection flows,
  all three interface languages, Russian UI with Ukrainian Scripture, empty and
  ambiguous topics, unchanged Ukrainian prayer text, and prefetch invalidation
  after an interface-language change.
- Transport tests cover omitted, null and supported language values, removal of
  unrelated fields, and one HTTP 422 failure without retry or field removal.
- Existing consent and conversation-limit tests remain passing. Server-side
  language detection is covered by the separate Bible-API task.

## Release prerequisite

On 2026-09-14, `GET https://api.bible.garden/openapi.json` showed that
`CompleteRequest` had no `default_language` property and used
`additionalProperties: false`. Deploy support from
https://app.clickup.com/t/86cbh47mf before merging/releasing the mobile change.
Live question requests and device installation were not performed against the
incompatible API.

GitHub's Actions workflows API returned zero workflows for Lampada-Mobile on
2026-09-14; validation was local. No CI run was available to execute.
