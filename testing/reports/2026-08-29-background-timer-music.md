# Таймер и музыка в фоне — отчёт проверки

- Дата: 2026-08-29
- Задача: [ClickUp 86cbbm5xd](https://app.clickup.com/t/86cbbm5xd)
- Среда ручной проверки: iPhone 17 Pro Simulator, iOS 26.5, native development build
- Expo: SDK 57.0.0, `expo-audio` 57.0.4

## Реализовано

- Таймер вычисляет `elapsed` и `remaining` по абсолютным моментам начала и
  окончания, а при возврате в `active` синхронизируется немедленно.
- Музыка не ставится на паузу из-за `AppState.background`.
- Музыкальная очередь использует `AudioPlayer`, регистрирует активный трек как
  системную media-сессию и восстанавливает background audio mode после временного
  аудиофокуса записи или озвучки Писания.
- Config plugin явно включает native background playback.

## Автоматические проверки

| Проверка | Результат | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS, exit 0 | `testing/evidence/2026-08-29-background/typecheck.log` |
| `npm test` | PASS, 68/68, exit 0 | `testing/evidence/2026-08-29-background/tests.log` |
| `npx expo config --type public` | PASS, background permissions присутствуют | `testing/evidence/2026-08-29-background/expo-config.log` |

Четыре новых unit-теста проверяют wall-clock расчёт, догон после background,
режим без таймера и нижнюю границу ручной корректировки.

## Ручной smoke на iOS Simulator

### Музыка

1. Запущена пятиминутная молитва и включена тихая музыка.
2. Приложение свёрнуто кнопкой Home.
3. После паузы тот же процесс возвращён через `launchApp.stopApp: false`.
4. UI показывает активное воспроизведение (`Тихая музыка`) и выключатель музыки;
   таймер догнал время, проведённое в фоне.

Результат: PASS. Evidence:

- `maestro-music-background.log`, `maestro-music-resume.log`;
- `BG-MUSIC-resumed-playing.png`.

### Таймер

1. Конечный таймер уменьшен до пяти секунд.
2. До достижения нуля приложение свёрнуто кнопкой Home.
3. После паузы тот же процесс возвращён без перезапуска.
4. Приложение уже перешло на рефлексию: видны `Завершить` и
   `Вернуться к молитве`.

Результат: PASS. Evidence:

- `maestro-timer-background.log`, `maestro-timer-resume.log`;
- `BG-TIMER-resumed-at-zero.png`.

## Что ещё нельзя считать проверенным

- Симулятор не подтверждает, что звук физически слышен при заблокированном экране.
- Нужен native release/dev build на физическом iPhone: музыка 5+ минут под lock,
  возврат в приложение, пауза и завершение сессии.
- Нужен отдельный Android-девайс: media notification, воспроизведение 5+ минут,
  переход между треками и возврат после background.
- В development build появлялся LogBox toast от существующего `console.warn`
  при сетевом fallback вопросов. В нативном системном логе ошибок фонового аудио
  не найдено; это не является проверкой release build.

До физического ретеста задача не переводится в `complete`.
