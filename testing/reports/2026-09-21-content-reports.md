# Content reports (RPT-001…003) — run 2026-09-21

Device: iPhone 17 Pro simulator (iOS 26.5), stub build (see
`2026-09-20-stub-phase.md` for the build recipe). The stub captures every
`/api/ai/content-reports` payload and serves `POST /__control
{"contentReports":"fail-once"}` to fail exactly one request (the retry case).

These scenarios cover the September 2026 complaints feature (merged after the
test plan was written); they had only a unit test and a manual note before.

## Results

| ID | Result | Evidence |
|---|---|---|
| RPT-001 | Passed | `ios-rpt-001-002.yaml`: flag button on the companion dock opens the dialog, send without a comment → «Спасибо. Жалоба отправлена на проверку.»; stub payload: `content_type: "question"`, `content_text` = the question, `language: "ru"`, no `user_comment`, and neither the prayer topic nor answers appear anywhere in the payload (`RPT-001-dialog.png`, `RPT-001-sent.png`) |
| RPT-002 | Passed | same flow: «Читать отрывок целиком» opens the full reader, flag button there opens the dialog; with the comment «Тестовый комментарий RPT-002» the stub payload carries `content_type: "scripture"`, the full passage text and the trimmed comment (`RPT-002-sent.png`) |
| RPT-003 | Passed | `ios-rpt-003.yaml` under fail-once: the first send shows «Сейчас не удалось отправить жалобу. Попробуйте ещё раз.», the dialog and the typed comment stay; the immediate retry succeeds with the same comment in the payload (two captured payloads share `user_comment: "Черновик комментария RPT-003"`, the first one got a 500) (`RPT-003-error.png`, `RPT-003-retry-sent.png`) |

## Artefacts

- Flows: `testing/e2e/ios-rpt-001-002.yaml`, `testing/e2e/ios-rpt-003.yaml`
- Stub support: `scripts/scripture-stub.mjs` (`/api/ai/content-reports`,
  `contentReports: "fail-once"`, payloads in `/__status`)
- Evidence: `testing/evidence/2026-09-21-stub/`
- Logs: `/tmp/rpt-run4.log`, `/tmp/rpt-run5.log` (both exit 0)

## Notes for future runs

- 500 maps to the generic `sendError` text («Сейчас не удалось отправить
  жалобу…»), while network/timeout map to the connection-specific one — the
  flows assert the 500 path.
- The full reader opens from the truncated passage preview, not from a tap
  anywhere on the card.

## Defects

None found.
