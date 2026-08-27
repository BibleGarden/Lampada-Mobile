# Контекстный подбор Писания — отчёт 2026-08-25

## Объект

- ClickUp: `86cb8vw1p`
- Expo SDK 57 / React Native 0.86
- iPhone 17 Pro Simulator, iOS 26.5
- API: локальный Bible-API из `.env.local`, `http://192.168.127.133:9084`

## Результат

Реализован серверный подбор `POST /api/scripture/v1/select`, single-flight prefetch
глубины один, retry/fallback, persistent history/cache, canonical favorites,
lossless-миграция старого избранного, точные ссылки по `passage` и privacy barrier.

## Автоматические проверки

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, 49/49, exit 0 |
| `npx expo-doctor` | PASS, 21/21, exit 0 |
| Release iOS build/install | PASS, exit 0 |
| Maestro main stub | PASS, exit 0 |
| Maestro privacy stub | PASS, exit 0; `privacySafe: true` |
| Maestro `503 → 429 → success` | PASS, exit 0 |
| Maestro live API + favorite + next/back | PASS, exit 0 |
| Maestro legacy favorites | PASS, exit 0 |
| Maestro layout regression: wrapped CTA + max reader safe area | PASS, exit 0 |

Полные логи и скриншоты: `testing/evidence/2026-08-25-scripture-context/`.

## Ретест замечаний ручного тестирования

- Баг `86cb9x9uc`: CTA теперь зависит от фактического количества строк, а не от
  порога в 160 символов. Fixture короче 160 символов с четырьмя абзацами
  показывает «Читать целиком» и открывает reader.
- Баг `86cb9x9ug`: `BottomSheet` получает верхний safe-area inset. На iPhone 17
  Pro reader с длинным текстом после свайпа к максимальному snap point остаётся
  ниже системной строки.
- Evidence: `reader-short-wrapped.png`, `reader-safe-area-max.png`.

## Проверка SQLite

- history содержит только два фактически показанных canonical ID;
- третий ответ находится в cache как prefetch с `shown = 0`;
- favorite содержит полный snapshot и canonical ID;
- схема миграции имеет версию `1`;
- известная legacy-запись сохраняет локальный текст, неизвестная — ссылку и
  пометку «Сохранено ранее»; обе открываются без сети.

## Не проверено человеком

- физический iPhone и Android;
- системное отключение сети во время открытой сессии (логика cache trail покрыта unit-тестом);
- субъективная оценка нового состояния loading/offline и экрана избранного владельцем продукта.
