# Этап 05 — AI, сеть и приватность

Дата: 2026-08-22
Среда: iPhone 17 Pro Simulator, iOS 26.5; Expo SDK 57.

## Результат

Пройдено после корректировки [[86cb8n4tg]]. При задержанном успешном AI-ответе приложение сразу открывает молитву, а в зоне вопроса показывает spinner до результата. Локальный fallback показывается только после явной ошибки AI. UI и сохранение opt-in, экспорт iOS-бандла, контролируемые HTTP/JSON/timeout-отказы низкоуровневого клиента и фактический payload проверены.

## Выполненные проверки

| Проверка | Результат | Evidence |
|---|---|---|
| Opt-in выключен по умолчанию | Pass | Maestro flow |
| Текст предупреждения меняется при включении | Pass | Maestro flow |
| Настройка сохраняется после перезапуска | Pass | Maestro flow |
| `npm test` | Pass: 5/5 | `checks.log` |
| `npm run typecheck` | Pass | `checks.log` |
| Экспорт iOS Expo | Pass | `checks.log` |
| Google/master key в экспортированном бандле | Не найден по сигнатурам | `checks.log` |
| HTTP 502, malformed JSON, timeout в `lib/llm.ts` | Pass | `llm-controlled-mocks.log` |
| Фактический payload без opt-in | Pass: текста ответа и аудио нет | `local-https-mock.log` |
| Фактический payload с opt-in | Pass: текст ответа есть, аудио нет | `local-https-mock.log` |
| Задержанный успешный AI-ответ | Pass: сессия открывается, в зоне вопроса spinner, затем AI-вопрос | `ios-stage05-first-question-spinner.yaml` |
| HTTP 502 первого AI-вопроса | Pass: сессия открывается, затем показан fallback | `ios-stage05-first-question-error-fallback.yaml` |
| Первый AI-вопрос без указанной темы | Pass: запрос отправлен, AI-вопрос показан | `ios-stage05-first-question-no-topic.yaml` |

## Статический аудит

- `lib/settings.ts`: `shareAnswers` по умолчанию `false`; значение сохраняется в SQLite.
- `lib/store.ts`: в AI передаётся только текст и только когда `shareAnswersNow()` возвращает `true`; URI и содержимое аудиозаписей не передаются.
- `lib/llm.ts`: клиент использует прокси, прерывает запрос через 25 секунд и пробрасывает HTTP/JSON-ошибки в слой fallback. Это подтверждено контролируемыми моками.
- `lib/ai.ts`: ошибки, пустой и некорректный ответ превращаются в локальный вопрос. `lib/store.ts` отсеивает поздние результаты по токену/ключу сессии.

## Контролируемые моки `llm`

Проверки запускались из корня репозитория с `node --experimental-strip-types`.
В каждом сценарии подменён `globalThis.fetch`; в timeout дополнительно подменён
таймер, чтобы `AbortController` сработал сразу. Во всех трёх случаях команда
завершилась с кодом 0:

```text
HTTP 502: res = { ok: false, status: 502 }
Malformed JSON: res.json() throws Error('malformed JSON')
Timeout: fetch waits for signal.abort, mocked setTimeout calls abort
```

## Не покрыто / требуется ретест

Все проверки этапа выполнены.

## Добавленный ретест

`testing/e2e/ios-stage05-first-question-spinner.yaml`
