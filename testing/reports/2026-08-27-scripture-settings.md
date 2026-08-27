# Настройки языка, перевода и озвучки — 2026-08-27

## Объём

- три зависимых списка на экране настроек;
- каталоги `/api/languages` и `/api/translations`;
- атомарное сохранение языка, перевода и озвучки;
- применение языка и перевода со следующей молитвенной сессии;
- восстановление после перезапуска и фильтрация offline fallback.

## Автоматические проверки

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 57/57 |
| `node --check scripts/scripture-stub.mjs` | exit 0 |
| iOS Debug build, iPhone 17 Pro / iOS 26.5 | exit 0, 0 errors, 1 Xcode warning о duplicate `-lc++` |
| `ios-scripture-settings.yaml` | exit 0 |
| `npx expo-doctor` | exit 1: 10 зависимостей SDK 57 отстают на один patch |

## Ручной ретест

1. Выбраны `English → bsb → Bob Souer`.
2. Нажато «Сохранить».
3. Приложение принудительно остановлено и запущено заново.
4. Все три значения восстановлены на экране настроек.
5. В SQLite `meta.scripture_preferences` сохранены `language=en`,
   `translationCode=16`, `voiceCode=151`.

## Evidence

- `testing/evidence/2026-08-27-scripture-settings/settings-persisted.png`
- `testing/evidence/2026-08-27-scripture-settings/typecheck.log`
- `testing/evidence/2026-08-27-scripture-settings/tests.log`
- `testing/evidence/2026-08-27-scripture-settings/maestro.log`
- `testing/evidence/2026-08-27-scripture-settings/expo-doctor.log`

## Ограничения

- Воспроизведение выбранной озвучки не входит в эту задачу.
- Дрейф patch-версий Expo существовал до изменения и требует отдельного обновления зависимостей.

## Follow-up после визуальной обратной связи

- Дефолт новой установки изменён: поддерживаемый сервером первичный язык устройства,
  иначе английский.
- Существующий сохранённый выбор имеет безусловный приоритет.
- Закрытые строки трёх списков и строки вариантов умеренно уменьшены по высоте и
  внутренним отступам; структура и размеры текста сохранены читаемыми.

### Повторные проверки

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 60/60 |
| iOS Debug rebuild с `expo-localization` | exit 0, 0 errors |
| Чистая установка, primary locale `en-KZ` | автоматически выбрано `en / 16 / 151` |
| Явно выбрать русский при locale `en-KZ`, перезапустить | `ru / 1 / 1` сохранено, локаль не переопределила выбор |

Дополнительные evidence:

- `testing/evidence/2026-08-27-scripture-settings/settings-compact-default.png`
- `testing/evidence/2026-08-27-scripture-settings/maestro-default-language.log`
- `testing/evidence/2026-08-27-scripture-settings/maestro-user-choice-overrides-locale.log`
- `testing/evidence/2026-08-27-scripture-settings/typecheck-followup.log`
- `testing/evidence/2026-08-27-scripture-settings/tests-followup.log`

## Follow-up по подписям переводов

- Технический API alias больше не показывается пользователю как название.
- Крупная строка берётся из `translation.name` (`BSB`, `WEBUS`, `WEBBE`).
- Вторичная строка берётся из `translation.description` (`Berean Standard Bible`,
  `World English Bible – US Edition`, `World English Bible – British Edition`).
- Свернутое значение также использует `translation.name`; `alias` остаётся только
  техническим полем и в этом UI не показывается.
- Повторный `npm test`: 60/60, typecheck и Maestro-проверка всех шести подписей — exit 0.

Evidence:

- `testing/evidence/2026-08-27-scripture-settings/translation-labels-corrected.png`
- `testing/evidence/2026-08-27-scripture-settings/maestro-translation-labels.log`

## Follow-up по разделителям вариантов

- Между соседними вариантами добавлен `StyleSheet.hairlineWidth` с бледной
  полупрозрачной линией; после последнего варианта разделителя нет.
- Typecheck, 60/60 unit-тестов и Maestro UI-проверка — exit 0.
- Evidence: `testing/evidence/2026-08-27-scripture-settings/option-dividers.png`.
