# Stage 05 - AI, network and privacy

Date: 2026-08-22
Environment: iPhone 17 Pro Simulator, iOS 26.5; Expo SDK 57.

## Result

Passed after the correction of `86cb8n4tg`. With a delayed successful AI response
the app opens the prayer immediately and shows a spinner in the question area
until the result arrives. The local fallback is shown only after an explicit AI
error. The opt-in UI and its persistence, the iOS bundle export, the controlled
HTTP/JSON/timeout failures of the low-level client and the actual payload were
verified.

## Checks performed

| Check | Result | Evidence |
|---|---|---|
| The opt-in is off by default | Pass | Maestro flow |
| The warning text changes when it is enabled | Pass | Maestro flow |
| The setting survives a restart | Pass | Maestro flow |
| `npm test` | Pass: 5/5 | `checks.log` |
| `npm run typecheck` | Pass | `checks.log` |
| The iOS Expo export | Pass | `checks.log` |
| A Google/master key in the exported bundle | Not found by signature | `checks.log` |
| HTTP 502, malformed JSON and a timeout in `lib/llm.ts` | Pass | `llm-controlled-mocks.log` |
| The actual payload without the opt-in | Pass: no answer text and no audio | `local-https-mock.log` |
| The actual payload with the opt-in | Pass: the answer text is there, the audio is not | `local-https-mock.log` |
| A delayed successful AI response | Pass: the session opens, a spinner appears in the question area, then the AI question | `ios-stage05-first-question-spinner.yaml` |
| HTTP 502 on the first AI question | Pass: the session opens, then the fallback is shown | `ios-stage05-first-question-error-fallback.yaml` |
| The first AI question with no topic given | Pass: the request is sent, the AI question is shown | `ios-stage05-first-question-no-topic.yaml` |

## Static audit

- `lib/settings.ts`: `shareAnswers` defaults to `false`; the value is stored in
  SQLite.
- `lib/store.ts`: only text is passed to the AI, and only when
  `shareAnswersNow()` returns `true`; neither the URIs nor the contents of the
  audio recordings are passed.
- `lib/llm.ts`: the client uses the proxy, aborts the request after 25 seconds and
  propagates HTTP and JSON errors into the fallback layer. This is confirmed by
  controlled mocks.
- `lib/ai.ts`: errors and an empty or malformed response turn into a local
  question. `lib/store.ts` filters out late results by the session token and key.

## The controlled `llm` mocks

The checks were run from the root of the repository with
`node --experimental-strip-types`. In every scenario `globalThis.fetch` was
replaced; in the timeout case the timer was replaced as well, so that
`AbortController` would fire immediately. In all three cases the command exited
with code 0:

```text
HTTP 502: res = { ok: false, status: 502 }
Malformed JSON: res.json() throws Error('malformed JSON')
Timeout: fetch waits for signal.abort, mocked setTimeout calls abort
```

## Not covered / needs a retest

Every check of this stage was performed.

## The retest that was added

`testing/e2e/ios-stage05-first-question-spinner.yaml`
