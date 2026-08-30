# Сводка прогона: блокировка приложения

Дата: 2026-08-30. Симулятор Pray SE, iOS 26.5, UDID
`18FBF907-60BB-48EF-9BE8-1DB2767465F5`, Debug-сборка. Maestro 2.6.1.

Все флоу запускались подряд, в указанном порядке: каждый следующий опирается на
состояние защиты, оставленное предыдущим.

```
maestro --device 18FBF907-60BB-48EF-9BE8-1DB2767465F5 test testing/e2e/<flow>.yaml
```

| Флоу | Exit code |
| --- | --- |
| `ios-lock-001-disabled-by-default.yaml` | 0 |
| `ios-lock-002-enable-pin.yaml` | 0 |
| `ios-lock-003-wrong-and-correct-pin.yaml` | 0 |
| `ios-lock-004-change-pin.yaml` | 0 |
| `ios-lock-005-disable-pin.yaml` | 0 |
| `ios-lock-006-forgot-pin-prepare.yaml` | 0 |
| `ios-lock-006-forgot-pin-wipe.yaml` | 0 |
| `ios-lock-007-background-timeout.yaml` | 0 |

Локальные проверки того же дерева:

| Команда | Exit code | Результат |
| --- | --- | --- |
| `npm run typecheck` | 0 | без ошибок |
| `npm test` | 0 | 86/86; ни одного теста на `lib/lock.ts` |

## Скриншоты

| Файл | Состояние |
| --- | --- |
| `lock-002-cold-start-locked.png` | холодный старт при включённом шестизначном пине: шесть точек, содержимое закрыто |
| `lock-003-wrong-pin-error.png` | неверный код: сообщение об ошибке, поле очищено, экран блокировки на месте |
| `lock-005-settings-protection-off.png` | настройки после снятия защиты: тумблер выключен, строки смены кода нет |
| `lock-006-empty-journal-after-wipe.png` | дневник после стирания через «Забыли пин-код?»: пустое состояние |

Нижнюю часть двух скриншотов перекрывает баннер LogBox «Open debugger to view
warnings» — артефакт Debug-сборки, в Release его нет.
