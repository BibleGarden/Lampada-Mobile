# ADR-0010: Показывать таймер молитвы на заблокированном экране

- Статус: Принято
- Дата: 2026-08-29
- Участники: владелец продукта, разработчик, QA-куратор

## Контекст

После ADR-0009 музыка продолжает играть в фоне и предоставляет системные media
controls, но молитвенный таймер виден только внутри приложения. Media pause
семантически относится к композиции и не должен скрыто останавливать молитву.
Секундные обновления из JavaScript ненадёжны после блокировки экрана, поэтому
системная поверхность должна считать время от абсолютного дедлайна самостоятельно.

## Решение

1. Сохранить независимость музыки и молитвы: media play/pause управляет только
   `AudioPlayer`; системный таймер использует `startedAtMs` и `endsAtMs` сессии.
2. На iOS 16.4+ использовать официальный Expo SDK 57 `expo-widgets` и
   `@expo/ui`: Live Activity отображает SwiftUI `Text(timerInterval:countsDown:)`
   на Lock Screen и Dynamic Island. `staleDate` равен дедлайну, поэтому после
   нуля система может показать завершённое состояние без запуска JavaScript.
3. На Android использовать локальный Expo Module и отдельное low-importance
   ongoing notification. `Notification.Builder` получает `setWhen(endsAtMs)`,
   `setUsesChronometer(true)` и `setChronometerCountDown(true)`; отдельный
   foreground service не создаётся.
4. Стартовать системный таймер только для конечной молитвы, обновлять его после
   ручной корректировки длительности и удалять при переходе к рефлексии,
   завершении или reset.
5. На Android запрашивать `POST_NOTIFICATIONS` при первом запуске конечной
   молитвы. Отказ не блокирует саму молитву, но скрывает системную карточку.

## Рассмотренные варианты

### Показывать время в metadata композиции

Отклонено: название и прогресс Now Playing принадлежат аудиотреку, а не молитве;
пауза музыки создавала бы двусмысленную связь с таймером.

### Обновлять текст раз в секунду из JavaScript

Отклонено: iOS и Android могут приостановить JavaScript в background. Нативные
timer interval и chronometer считают секунды на стороне системы.

### Запустить Android foreground service для таймера

Отклонено: на Android 14+ foreground service обязан иметь разрешённый тип, а
обычный молитвенный countdown не относится ни к одному подходящему типу. Media
foreground service `expo-audio` остаётся ответственностью музыки.

### Одна кроссплатформенная библиотека уведомлений

Отклонено: iOS Live Activity требует WidgetKit extension, а Android countdown —
системных chronometer-флагов. Маленький платформенный слой сохраняет нативную
семантику без секундного планировщика и лишнего внешнего runtime.

## Последствия

- iOS deployment target повышается до 16.4; Expo Go больше не подходит для этой
  функции, требуется новая native build.
- `expo-widgets` создаёт WidgetKit extension, App Group `group.twinkler` и
  дополнительный bundle `twinkler.ExpoWidgetsTarget`; signing этих целей нужно
  проверять на физическом устройстве и в EAS.
- Плагин Expo Widgets 57.0.15 добавляет `aps-environment` entitlement даже при
  выключенных push updates; локальная реализация push-токены не использует.
- Android package впервые фиксируется как `com.nf404.twinkler`. Его нельзя менять
  после публикации в Google Play без создания нового приложения.
- При принудительной выгрузке процесса приложение не восстанавливает активную
  сессию. Системная карточка считает до дедлайна; окончательная очистка также
  выполняется при следующем запуске/reset.
- Физические iPhone и Android остаются обязательными для проверки Lock Screen,
  Dynamic Island, permission denial и совместной работы с media controls.

## Ссылки

- ClickUp: https://app.clickup.com/t/86cb8uhct
- [ADR-0009](0009-background-prayer-session.md)
- [Expo Widgets SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/)
- [Expo UI Text SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/text/)
