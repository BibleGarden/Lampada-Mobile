# Critical E2E run 2026-09-20

Group 1 (critical tier, 11 flows) of the tiered e2e suite, run on the
"Pray Smoke iPhone 17 Pro" simulator (05F697B7-36CD-4050-9D57-FC9316AA093C,
iOS 26.5) against the local Release build of twinkler installed 2026-09-20.

First e2e run after 2026-08-30 (the only verified e2e run of any flow in
September before this one was none).

## Results

| Flow | Result | Note |
|---|---|---|
| stage04-answers-text | Passed | |
| stage06-jrn-001-empty-history | Passed | |
| stage06-end-001-finish-without-takeaway | Passed after flow fix | banner assert moved before Home asserts |
| privacy-consent-first-use | Passed after flow fix (separate re-run) | stale consent text + stale post-deny screen + BottomSheet navigation |
| stage03-navigation | Passed | |
| stage06-end-002-finish-with-takeaway | Passed after flow fix | Enter instead of tapping the kicker |
| stage03-setup-start | Passed after flow fix | stale threshold wording |
| smoke-full | Passed after flow fix | takeaway no longer on Home (ADR-0028) |
| smoke-full-relaunch | Passed | persistence confirmed |
| scripture-context-privacy | Blocked | requires a stub build (see below) |
| stage03-session-finite | Passed | |

First attempt of the full group: 5 passed / 6 failed — all six failures were
stale flows, no app bugs. After flow fixes: 9 passed / 2 failed in the second
full run; `privacy-consent-first-use` passed on an individual re-run
(exit 0, all steps COMPLETED).

## Failure analysis (first attempt, all FLOW-STALE)

Root cause for most: commit 81056c8 (2026-09-06, ADR-0028) — completion goes
straight Home, new AI wording, consent settings moved into the "Данные для ИИ"
BottomSheet (`privacy-settings-button`, `app/settings.tsx:913`).

- end-001: `prayer-saved-notice` auto-hides after 4 s (`app/index.tsx:37-41`),
  the assert only started ~8 s after tapping "Завершить".
- end-002: the "ПРЕЖДЕ ЧЕМ ЗАКРЫТЬ" kicker is not rendered while the keyboard is
  open (`app/reflect.tsx:144`); replaced with `pressKey: Enter`.
- privacy-consent-first-use: consent text changed to
  "…на сервер приложения…" (`components.reader.aiBody`); after deny the app
  goes to the threshold screen "Перед началом" (the "Прежде чем войти" screen
  no longer exists); consent toggles live in the BottomSheet.
- setup-start: "У тебя 5 минут наедине с Богом" → "Впереди — 5 минут наедине с
  Богом" (`screens.threshold.timed`).
- smoke-full: the takeaway quote is no longer shown on Home; the journal checks
  further down the flow (and in smoke-full-relaunch) cover it.
- scripture-context-privacy: toggle moved into the BottomSheet; fixed, but the
  flow is still blocked on the stub (below).

## scripture-context-privacy is environment-blocked

The flow asserts the stub fixture "Псалом 22:1–6", so it can only pass against
a build pointed at the scripture stub:
`SCRIPTURE_STUB_MODE=privacy npm run scripture:stub` (port 9085,
`scripts/scripture-stub.mjs`) plus a build with
`EXPO_PUBLIC_API_URL=http://localhost:9085`. The installed Release build points
at the real server, so the passage never appears (screenshot: prayer screen
with an empty "Цитата" tab). The 42-tag suite scripts do not cover this flow;
a separate stub run is tracked in ClickUp.

## Environment fixes applied

- `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000` added to all `test:e2e:*` npm scripts
  — without it the first cold run fails with "iOS driver not ready in time"
  (XCTest bootstrap after a fresh boot/Reboot takes longer than the Maestro
  default). Reproduced twice on 2026-09-20 before the fix.
- The repeated simulator reboots seen during the 2026-09-19/20 attempts were
  Maestro itself restarting the device on XCTest driver degradation; after the
  macOS reboot and a single clean boot of the simulator no reboot cycle
  occurred in either full run.

## Changed files (uncommitted, flow fixes only)

- testing/e2e/ios-stage06-end-001-finish-without-takeaway.yaml
- testing/e2e/ios-stage06-end-002-finish-with-takeaway.yaml
- testing/e2e/ios-privacy-consent-first-use.yaml
- testing/e2e/ios-stage03-setup-start.yaml
- testing/e2e/ios-smoke-full.yaml
- testing/e2e/ios-scripture-context-privacy.yaml
- package.json (driver startup timeout in test:e2e:* scripts)

No app code changes. No app bugs found in this group.

## Commands and exit codes

- `npm run test:e2e:critical` (attempt 1): exit 1, 5/11 passed.
- `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 npm run test:e2e:critical`
  (attempt 2, after flow fixes): exit 1, 9/11 passed.
- `maestro test testing/e2e/ios-privacy-consent-first-use.yaml`: exit 0.
- Full logs: `/tmp/e2e-critical-run.log`, `/tmp/e2e-critical-run2.log`,
  `/tmp/e2e-critical-run3.log`, `/tmp/e2e-prv-retry.log` (kept in /tmp per
  evidence policy; Maestro detail logs under `~/.maestro/tests/2026-09-20_*`).
