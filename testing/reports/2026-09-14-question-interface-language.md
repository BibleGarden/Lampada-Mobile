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

## SE simulator installation

Follow-up verification on 2026-09-14:

- The API selected by `.env.local` advertises `default_language` with the
  expected `ru`/`uk`/`en`/null schema. An invalid language returns HTTP 422 with
  `literal_error`, rather than an unknown-field error.
- Empty-topic requests with `ru`, `uk` and `en` each returned HTTP 200 and a
  question in the requested language.
- A synthetic Ukrainian topic with Russian `default_language` returned HTTP
  502 once. It was not retried; live verification of detection priority remains
  unsuccessful. No cause was inferred from the status alone.
- The configured local API is a different origin from `api.bible.garden`.
  A subsequent public OpenAPI check still showed no `default_language` field;
  the public-release prerequisite above remains in effect.

For installation, the feature commit `7174062` was combined with the existing
application changes at `ac0c7f1` in a temporary worktree. The combined sources
passed all 203 tests and TypeScript checking, both with exit 0 and no diagnostics
or warnings. The local environment preflight passed without exposing values.

Built with `npm run ios -- --configuration Release --device
18FBF907-60BB-48EF-9BE8-1DB2767465F5 --no-bundler`. The script reserved version
1.0.21. Native build and installation exited 0; Xcode reported zero errors and
four warnings concerning native linking and signed widget binaries. The build
log also contained a Node color-environment warning.

Verified the installed `twinkler` bundle on Pray SE reports version 1.0.21,
contains an embedded JavaScript bundle with `default_language`, and opens the
Home screen. The screenshot is
[SE Home](../evidence/2026-09-14-question-interface-language/se-home.png).
