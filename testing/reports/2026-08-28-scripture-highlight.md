# Подсветка ключевых стихов — отчёт 2026-08-28

## Объект

- ClickUp: `86cbb120a`
- Expo SDK 57.0.17 / React Native 0.86.3
- iPhone 17 Pro Simulator, iOS 26.5
- API: локальный `scripts/scripture-stub.mjs`

## Результат

Клиент принимает опциональные `passage.verses` и `highlight`, собирает абзацы
из структурированных стихов и выделяет диапазон только по
`highlight.passage`. Ответы и старый кэш без `verses` отображаются прежним
сплошным текстом; `coverage_empty` считается успешной серверной деградацией.

## Автоматические проверки

| Проверка | Результат |
| --- | --- |
| `npm test` | PASS, 64/64, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |
| Release iOS build/install | PASS, exit 0 |
| Maestro `ios-scripture-highlight.yaml` | PASS, exit 0 |

## Ретест найденного дефекта

Баг `86cbb2nwd`: фон подсветки захватывал перенос абзаца и создавал большой
прямоугольник. Межстиховый префикс вынесен из стилизованного `Text`; повторный
Maestro-прогон и визуальная проверка preview/reader подтверждают, что фон
ограничен текстом ключевого стиха.

## Evidence

- `testing/evidence/2026-08-28-scripture-highlight/preview-highlight.png`
- `testing/evidence/2026-08-28-scripture-highlight/reader-highlight.png`

## Ограничения проверки

Live-ретест с новым Bible-API не выполнен: указанный в ClickUp коммит
`dc9a6b4` отсутствует в доступном локальном репозитории и на `origin/master`.
Контракт проверен по финальному комментарию ClickUp и локальному stub.
