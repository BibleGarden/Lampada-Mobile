# Настройка расписаний и локальные уведомления — отчёт проверки

Дата: 2026-09-02  
Устройство: iOS Simulator `Pray SE`, iOS 26.5  
Сборка: локальная Debug, Expo SDK 57

## Результат

Настройка нескольких расписаний, сохранение в SQLite, включение/выключение,
перепланирование и фактическая доставка локального уведомления работают.

Исходное расписание симулятора перед проверкой сохранено и после проверки
восстановлено. После восстановления в системном архиве снова находятся ровно
12 ожидаемых WEEKLY-запросов.

## Проверки

| Проверка | Результат | Evidence |
|---|---|---|
| Полный `npm test` | PASS, exit 0, 128/128 | [`npm-test.log`](../evidence/2026-09-02-reminder-settings-notifications/npm-test.log) |
| TypeScript `npm run typecheck` | PASS, exit 0 | [`typecheck.log`](../evidence/2026-09-02-reminder-settings-notifications/typecheck.log) |
| В UI видны два сохранённых расписания и пункт добавления | PASS | [`ui-multiple-schedules.log`](../evidence/2026-09-02-reminder-settings-notifications/ui-multiple-schedules.log) |
| Добавление третьего расписания, изменение дня, сохранение в SQLite | PASS | [`ui-multiple-schedules.log`](../evidence/2026-09-02-reminder-settings-notifications/ui-multiple-schedules.log) |
| Выключение: `enabled=false`, pending-запросов 0 | PASS | [`toggle-off.log`](../evidence/2026-09-02-reminder-settings-notifications/toggle-off.log) |
| Повторное включение: `enabled=true`, pending-запрос восстановлен | PASS | [`toggle-on.log`](../evidence/2026-09-02-reminder-settings-notifications/toggle-on.log) |
| Контрольное правило на среду 12:32 попало в iOS как WEEKLY (`weekday=4`) | PASS | [`controlled-pending.txt`](../evidence/2026-09-02-reminder-settings-notifications/controlled-pending.txt) |
| Уведомление доставлено при завершённом приложении | PASS | [`delivered-after.txt`](../evidence/2026-09-02-reminder-settings-notifications/delivered-after.txt), [`notification-center.png`](../evidence/2026-09-02-reminder-settings-notifications/notification-center.png) |
| Исходное расписание восстановлено, pending=12 | PASS | [`pending-after-restore.txt`](../evidence/2026-09-02-reminder-settings-notifications/pending-after-restore.txt) |

## Не подтверждено

Переход в приложение по тапу на уже доставленное уведомление автоматически не
подтверждён. Maestro дважды выполнил тап по карточке на экране Центра уведомлений,
но iOS Simulator оставил экран заблокированным и приложение не открылось. Это не
подтверждает дефект приложения: событие нажатия до приложения не дошло. Логи
попыток: [`tap-notification-attempt.log`](../evidence/2026-09-02-reminder-settings-notifications/tap-notification-attempt.log),
[`tap-notification-coordinate-attempt.log`](../evidence/2026-09-02-reminder-settings-notifications/tap-notification-coordinate-attempt.log).

Для окончательной проверки этого пункта нужно вручную нажать свежее уведомление
на разблокированном симуляторе или физическом iPhone и убедиться, что открылась
главная приложения.

## Ограничение среды

Simulator подтверждает создание системных запросов, показ и хранение
уведомления. Надёжность доставки после длительного простоя и перезагрузки нужно
отдельно проверять на физическом iPhone.
