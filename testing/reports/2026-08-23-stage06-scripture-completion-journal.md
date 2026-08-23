# Этап 06 — Писание, завершение и дневник

Дата: 22–23 августа 2026
Задача: ClickUp `86cb8kdyu`
Репозиторий: `pray`
Окружение: iPhone 17 Pro Simulator / iOS 26.5; iPhone SE (3rd generation) Simulator / iOS 26.5; Expo SDK 57 dev build.

## Итог

После исправления трёх найденных дефектов пройдены все 17 сценариев этапа: SCR-001–003, END-001–005 и JRN-001–009.

Найденные и закрытые после ретеста баги:

- `86cb8pj4y` — будущие даты молитвы вытесняли реальные точки недели;
- `86cb8pmtr` — избранное Писания не восстанавливалось после relaunch;
- `86cb8pq1k` — абсолютные URI аудио ломались после install-over и смены UUID iOS data-container;
- `86cb8pu8c` — при записи с открытой клавиатурой stop-кнопка оказывалась вне доступной области.

## Матрица сценариев

| ID | Результат | Способ проверки |
|---|---|---|
| SCR-001 | PASS | Maestro: вход в Писание, замена frontier без избранного, рост trail с избранным, обе границы |
| SCR-002 | PASS | Maestro: добавить → relaunch → восстановить → удалить → relaunch |
| SCR-003 | PASS | Maestro + визуальная проверка прокрутки длинного отрывка на iPhone 17 Pro и iPhone SE |
| END-001 | PASS | Maestro + SQLite: завершение без вывода, нет пустой карточки, запись видна в дневнике |
| END-002 | PASS | Maestro: вывод виден на Done и в дневнике |
| END-003 | PASS | Maestro + SQLite: двойное завершение создало одну сессию и одну отметку дня |
| END-004 | PASS | Maestro + SQLite: две содержательные сессии, одна строка `prayed_days` |
| END-005 | PASS после фикса | Regression unit в Europe/Moscow, America/New_York и Australia/Lord_Howe; будущие даты, DST и граница суток |
| JRN-001 | PASS | Maestro: пустая история и пустой поиск |
| JRN-002 | PASS | Maestro + SQLite: брошенная пустая сессия не отображается |
| JRN-003 | PASS | Maestro с подготовленными SQLite-данными: поиск по цели, выводу, вопросу и ответу |
| JRN-004 | PASS | Maestro: кириллический поиск с другим регистром |
| JRN-005 | PASS после фикса | Maestro: реальная запись, текст, сохранение, завершение и детали дневника |
| JRN-006 | PASS | Maestro + визуальная проверка: при переключении деталей pause-индикатор остаётся только у активного источника |
| JRN-007 | PASS | Maestro + SQLite + файл: каскад удалён, `prayed_days` сохранён |
| JRN-008 | PASS после фикса | `simctl install` поверх сборки, SHA-256 SQLite/аудио, миграция legacy URI, воспроизведение в дневнике |
| JRN-009 | PASS | Maestro с отсутствующим файлом: детали и попытка воспроизведения не приводят к падению |

## Финальные проверки кода

- `npm test`: 13/13, exit 0;
- `npm run typecheck`: exit 0;
- `npx expo install --check`: dependencies up to date, exit 0;
- `git diff --check`: exit 0;
- Debug iOS build для install-over: exit 0.

## Evidence

Полные логи сценариев:

- `scr-maestro-001.log`, `scr-maestro-002.log`, `scr-maestro-003-small.log`;
- `end-maestro-001.log`, `end-maestro-002.log`, `end-maestro-003-004.log`;
- `jrn-maestro-001.log`, `jrn-maestro-002.log`, `jrn-maestro-003-004.log`, `jrn-maestro-005.log`, `jrn-maestro-006.log`, `jrn-maestro-007.log`, `jrn-maestro-008.log`, `jrn-maestro-009.log`;
- `final-tests.log`, `final-typecheck.log`, `final-expo-check.log`, `final-diff-check.log`.

Снимки БД и install-over:

- `end-sqlite-001-after.txt`, `end-sqlite-003-004.txt`, `end-datelogic-check.txt`, `end-datelogic-final-pass.txt`;
- `jrn-sqlite-00-initial.txt`, `jrn-sqlite-002-abandoned.txt`, `jrn-sqlite-007-after-delete.txt`;
- `jrn-008-install-over-before.txt`, `jrn-008-install-over-after.txt`.

Финальные скриншоты:

- `END-001-home-before.png`, `END-001-reflect-empty-input.png`, `END-001-done-no-takeaway-card.png`, `END-001-home-after.png`, `END-001-journal.png`;
- `END-002-reflect-filled.png`, `END-002-done-takeaway-card.png`, `END-002-journal-takeaway.png`, `END-003-004-two-prayers-one-day.png`;
- `JRN-001-empty-history.png`, `JRN-001-empty-search.png`, `JRN-002-session-started.png`, `JRN-002-journal-after-abandon.png`, `JRN-003-004-search-cyrillic.png`;
- `JRN-005-recording-overlay-a.png`, `JRN-005-recording-saved-a.png`, `JRN-005-journal-detail-text-audio.png`;
- `JRN-006-first-playing.png`, `JRN-006-second-playing.png`, `JRN-007-after-delete.png`, `JRN-008-after-install-over-playback.png`, `JRN-009-missing-file-handled.png`;
- `SCR-001-00-initial-scripture.png`, `SCR-001-A1-next.png`, `SCR-001-A6-prev-after-noop-forward.png`, `SCR-001-B00-favorited.png`, `SCR-001-B10-next-catalog-exhausted.png`, `SCR-001-B11-next-past-exhausted.png`, `SCR-001-C10-prev-at-start.png`, `SCR-001-C11-prev-boundary-noop.png`;
- `SCR-002-before-relaunch.png`, `SCR-002-after-relaunch.png`, `SCR-002-removed-after-relaunch.png`;
- `SCR-003-long-reader-top.png`, `SCR-003-long-reader-bottom.png`, `SCR-003-small-reader-top.png`, `SCR-003-small-reader-bottom.png`.

`end-datelogic-check.txt` сохраняет первичное воспроизведение END-005 с FAIL. Финальный all-PASS прогон в Europe/Moscow, America/New_York и Australia/Lord_Howe сохранён в `end-datelogic-final-pass.txt`; regression unit — в `final-tests.log`.
