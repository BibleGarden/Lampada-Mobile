# Stub-phase runs 2026-09-20 (update banners, scripture navigation, legacy favorites, threshold error path)

Device: iPhone 17 Pro simulator (iOS 26.5). Build: `expo run:ios
--configuration Release --no-bundler` with `EXPO_PUBLIC_API_URL=http://localhost:9085`
and `EXPO_PUBLIC_FORCE_SESSION_ERROR=1`, Metro serving the bundle with the same
variables (`expo start` reads `.env.local` for the AI proxy key). Stub:
`scripts/scripture-stub.mjs`, extended this session with `/api/version-check`,
`/api/ai/transcribe`, a delayable `/api/ai/question` and `POST /__control` for
switching behaviour between flows.

## Results

| Scenario | Result | Evidence |
|---|---|---|
| update-soft | Passed | `ios-update-soft.yaml`: banner «Доступно обновление» with stub message, «Позже» hides it until a cold start (`UPDATE-soft-banner.png`, `UPDATE-soft-relaunch.png`) |
| update-hard | Passed | `ios-update-hard.yaml`: no «Позже», banner persists across navigation and a cold start (`UPDATE-hard-banner.png`, `UPDATE-hard-relaunch.png`) |
| SCR-001 | Passed | `ios-stage06-scr-001-navigation.yaml` reworked for the deterministic two-fixture stub: forward paging without favorites, favorite both passages, catalog exhaustion repeats the passage with the favorite state intact, prev walks back and is a safe no-op at the start (`SCR-001-*.png`) |
| SCR-002 | Passed | `ios-stage06-scr-002a/002b`: favorite survives an app relaunch (restored from SQLite), unfavorite survives too (`SCR-002-*.png`); the stub counter is reset between sessions via `POST /__control {"resetScripture":true}` |
| legacy favorites migration | Passed | `seed-legacy-favorites.sh` seeds two legacy refs (known «Колоссянам 3:23» with full text, unknown ref) and clears the migration marker; `ios-scripture-legacy-favorites.yaml`: known ref renders its text, unknown ref shows «Сохранено ранее» |
| threshold error path (sqlite-lock replacement) | Passed | `ios-stage03-start-sqlite-lock.yaml` under `EXPO_PUBLIC_FORCE_SESSION_ERROR=1`: the first session start fails with «Не удалось начать молитву / Попробуй ещё раз.», the button stays alive and the retry enters the session (`STG-sqlite-error.png`, `STG-sqlite-retry-ok.png`). The hook fires only for topics starting with `STG`, so the rest of the build behaves normally |

Together with the same-session runs recorded in
`2026-09-20-jrn-transcription.md` (JRN-010…013) and the update flows above, the
whole stub-phase list from ClickUp task 86cbj95j4 is now covered; the
scripture-context flows (privacy/main/fallback/highlight) were already green in
the 2026-09-20 run and were not repeated.

## Follow-ups

- The app was reinstalled with the normal Release build afterwards and the
  final smoke passed.
- jrn-006/008/009 (second audio, upgrade, missing file) keep their manual
  fixtures and are tracked separately.

## Defects

None found.
