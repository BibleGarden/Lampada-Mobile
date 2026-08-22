# Smoke-прогон iOS Simulator — 2026-08-21–22

- Статус: **Passed**
- Покрытие: PRE-001…PRE-004 и SMK-001…SMK-007
- Исходный commit: `55fcc72de02c241b57b988fb75715c10581f77b9`
- Исправление: незакоммиченные изменения `package.json` и `package-lock.json`

## Итог

После согласования зависимостей Expo SDK 57 приложение успешно собрано,
установлено и прошло полный smoke-сценарий на чистом iOS Simulator.

Финальный непрерывный прогон создал ровно одну молитву, досрочно завершённую
через 20 секунд из запланированных 300. Текстовый ответ, вывод и день серии
остались в SQLite и отображались в дневнике после force-stop/relaunch.

## Окружение

- macOS 26.5.2 (`25F84`)
- Xcode 26.6 (`17F113`)
- Node.js 24.18.0
- npm 11.16.0
- Expo 57.0.15
- React Native 0.86.2
- Expo Modules Core 57.0.12
- Hermes `250829098.0.16`
- Maestro 2.6.1
- `Pray Smoke iPhone 17 Pro`, iOS 26.5 (`23F77`)
- UDID: `05F697B7-36CD-4050-9D57-FC9316AA093C`
- Release, `iphonesimulator`, arm64

## Исправление блокера запуска

Исходный Release-билд падал 3/3 раза при динамической линковке: Expo FileSystem
57.0.5 ожидал `BaseModule.willDestroy`, отсутствующий в Expo Modules Core
57.0.2. Зависимости согласованы официальным `npx expo install --fix` внутри
SDK 57. Дополнительно явно закреплён `react-dom 19.2.3`, совпадающий с React,
чтобы npm не выбирал несовместимый peer `react-dom 19.2.8`.

После обновления выполнены чистая установка Pods и чистая Release-сборка в
новом DerivedData. Код приложения не менялся.

## Подготовительные проверки

| ID | Статус | Результат |
|---|---|---|
| PRE-001 | Passed | `npm install`, exit code 0; lock-файл обновлён |
| PRE-002 | Passed | `npm run typecheck`, exit code 0 |
| PRE-003 | Passed | `expo install --check`, exit code 0; Expo Doctor 21/21, exit code 0 |
| PRE-004 | Passed | чистый `pod install` и Release `xcodebuild`, exit code 0; `BUILD SUCCEEDED` |

Release-сборка:

```text
/tmp/pray-fix-sdk57/DerivedData/Build/Products/Release-iphonesimulator/Lampada.app
```

Полный лог сборки: `/tmp/pray-fix-sdk57/xcodebuild-release.log` — 58 525 строк,
exit code 0, ошибок 0. Первичная шумная сводка насчитала 2796 предупреждений.
Последующая классификация полного воспроизводимого Release-лога выделила 1466
warning-записей: 1403 из Pods, 55 из сгенерированного iOS/Hermes-кода, 8 из
окружения/toolchain и 0 из нативного кода проекта. Сборка не объявляется
«без предупреждений».

## Результаты SMK-001–SMK-007

| ID | Статус | Фактический результат |
|---|---|---|
| SMK-001 | Passed | холодный запуск показывает главный экран; процесс не падает, новых crash reports нет |
| SMK-002 | Passed | цель `Финальный smoke` и 5 минут отображаются на экране порога |
| SMK-003 | Passed | удержание 450 мс отменено; удержание 1700 мс создало ровно одну сессию |
| SMK-004 | Passed | ответ `Финальный ответ` сохранён; действие сменилось на `Изменить` |
| SMK-005 | Passed | сессия завершена через 20 секунд из 300; вывод `Финальный вывод` показан на экране успеха |
| SMK-006 | Passed | дневник показывает молитву, вопрос, ответ и вывод |
| SMK-007 | Passed | после force-stop/relaunch UI и SQLite содержат те же данные и день серии `2026-08-22` |

Финальный Maestro flow и отдельный relaunch flow завершились с exit code 0.

## Проверка локальных данных

До и после relaunch получен одинаковый результат:

```text
sessions: id=1, topic=Финальный smoke, planned_minutes=5,
          elapsed_sec=20, takeaway=Финальный вывод
answers:  session_id=1, question_index=0, text=Финальный ответ
prayed_days: 2026-08-22
```

Файлы `final-db-before-relaunch.log` и `final-db-after-relaunch.log` идентичны
(`cmp` exit code 0).

## Дефекты

- [BUG-001 — зависимости SDK 57 и регрессия Hermes](https://app.clickup.com/t/86cb8jr0j): **Fixed / Verified**.
- [BUG-002 — Release-сборка падает при запуске](https://app.clickup.com/t/86cb8jr17): **Fixed / Verified**.

Новых продуктовых дефектов в пределах SMK-001…SMK-007 после исправления не
обнаружено. Предупреждения npm audit (10 moderate, 4 high) и предупреждения
нативной сборки требуют отдельного анализа и не считаются автоматически
подтверждёнными пользовательскими багами.

## Доказательства

Каталог: `testing/evidence/2026-08-22-ios-simulator/`

- `final-SMK-001-cold-launch.png` … `final-SMK-007-relaunch.png`;
- `maestro-full-final.log` и `maestro-full-final-relaunch.log`;
- `final-db-before-relaunch.log` и `final-db-after-relaunch.log`;
- `expo-install-check-after.log`, `expo-doctor-after.log`, `typecheck-after.log`;
- `pod-install-clean.log`, `xcodebuild-summary.txt`, `final-exit-codes.txt`.

## Ограничения результата

Прогон подтверждает только SMK-001…SMK-007 на одном iOS Simulator. Микрофон,
реальное аудио, хаптика, физический iPhone, Android, accessibility, offline/AI
ошибки и расширенные сценарии из `TEST_PLAN.md` этим результатом не покрыты.
