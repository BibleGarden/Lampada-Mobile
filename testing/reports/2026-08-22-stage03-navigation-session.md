# Этап 03 — навигация, настройка и таймер Lampada

- Дата: 2026-08-22
- Статус: **Passed with limitations**
- ClickUp: `86cb8kdy9`
- Исходный commit: `a38a07a8610dae641d98e014b3b39d8b8f2e31ea`
- Проверяемые изменения: незакоммиченные правки stateful deep links и обработки ошибки создания сессии

## Итог

Проверены 20 сценариев NAV-001–NAV-005, SETUP-001–SETUP-004,
START-001–START-004 и SES-001–SES-007. Результат: 18 Passed,
1 Blocked, 1 Not run, 0 Failed после исправлений.

Два обнаруженных дефекта исправлены и повторно проверены на native iOS Release:

- `86cb8khp9`: stateful deep links без активной сессии больше не позволяют
  засчитать день молитвы;
- `86cb8kjg6`: ошибка создания сессии показывает Alert, оставляет кнопку
  доступной и записывает безопасную локальную диагностику вне SQLite.

## Окружение

- `Pray Smoke iPhone 17 Pro`, iOS 26.5
- UDID `05F697B7-36CD-4050-9D57-FC9316AA093C`
- Release, `iphonesimulator`
- bundle `com.marianovikov.lampada`
- Expo SDK 57.0.15, React Native 0.86.2

Финальная Release-сборка завершилась с exit code 0 и маркером
`BUILD SUCCEEDED`. В финальном полном логе 8 196 строк, 0 error-lines и
58 warning-lines; предупреждений из `ios/Lampada` не найдено.

## Результаты

| ID | Статус | Фактический результат |
|---|---|---|
| NAV-001 | Passed | Чистый запуск показывает главный экран и доступный основной поток |
| NAV-002 | Passed | Незавершённая цель и 30 минут сбрасываются к пустой цели и 10 минутам |
| NAV-003 | Passed | `/session`, `/reflect`, `/done` без `sessionId` возвращают Home; SQLite остаётся `sessions=0`, `prayed_days=0` |
| NAV-004 | Not run | Android Back не относится к доступной iOS-сборке; переносится в Android-прогон |
| NAV-005 | Passed | Двойные нажатия на вход и «Далее» не создают дублей экранов или сессий |
| SETUP-001 | Passed | Пустая цель запускает свободную молитву без сломанной фразы |
| SETUP-002 | Passed | Все четыре примера выбираются, модальное окно закрывается |
| SETUP-003 | Passed | Пресеты `5/15/30/60/∞`, склонения и нижняя безопасная граница работают |
| SETUP-004 | Passed | После системной клавиши «Готово» клавиатура закрывается, «Далее» доступна; длинная цель проходит в сессию |
| START-001 | Passed | Короткое удержание сбрасывается и не создаёт сессию |
| START-002 | Passed | Полное удержание открывает таймер и создаёт одну сессию |
| START-003 | Passed | Защита перехода и SQL-проверки не выявили параллельных сессий |
| START-004 | Passed | Под `BEGIN EXCLUSIVE` показан Alert, сессий 0; после `ROLLBACK` retry создаёт ровно одну сессию |
| SES-001 | Passed | Конечный таймер дошёл до нуля и открыл одну рефлексию |
| SES-002 | Passed | В `∞` прошедшее время растёт, автоматического завершения нет |
| SES-003 | Passed | Коррекция `−1/+1` работает, нижняя граница остаётся 5 секунд |
| SES-004 | Blocked | На физическом iPhone не проверялось; продуктовая политика background/foreground не определена |
| SES-005 | Passed | Досрочное завершение и сохранение открытого ответа подтверждены smoke-прогоном и SQLite |
| SES-006 | Passed | «Вернуться к молитве» запускает новый отсчёт с той же целью; прежняя запись и ответ остаются в SQLite |
| SES-007 | Passed | Длинная цель ограничивается тремя строками и не перекрывает таймер или панель спутника |

## Ретест дефектов

### Deep links без сессии

На чистом состоянии последовательно открыты `lampada://session`,
`lampada://reflect`, `lampada://done`. Каждый маршрут показал Home. Итог SQL:

```text
sessions|0
prayed_days|0
```

Штатный `setup → threshold → session` после этого успешно создаёт одну сессию.

### Ошибка SQLite

При внешнем `BEGIN EXCLUSIVE` полное удержание показывает:
«Не удалось начать молитву» / «Попробуй ещё раз». После закрытия Alert кнопка
снова доступна, `sessions_under_lock=0`.

Файл `Documents/lampada-diagnostics.log` содержит одну JSONL-запись с временем,
событием `session_start_failed` и `errorKind=error`. Цель, ответы, текст ошибки,
stack и сведения о БД отсутствуют. После `ROLLBACK` повторное удержание успешно,
`sessions_after_retry=1`.

## Доказательства

Каталог: `testing/evidence/2026-08-22-stage03/`.

- `maestro-navigation.log`, `maestro-setup-start.log`;
- `maestro-session-finite.log`, `maestro-session-infinite.log`;
- `maestro-long-goal.log`, `SES-007-long-goal.png`;
- `maestro-deep-links.log`;
- `maestro-sqlite-*.log`, `START-004-alert.png`;
- `sql-and-diagnostics.txt`, `typecheck.log`, `build-summary.txt`, `exit-codes.txt`.

## Ограничения

NAV-004 требует Android-сборку. SES-004 требует продуктового решения о том,
должен ли таймер паузиться или учитывать реальное время, и финального ручного
прогона на физическом iPhone. Хаптика Simulator-ом не подтверждается.
