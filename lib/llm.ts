import { limitQuestionRequest } from './questionRequest';
import type { QuestionRequest } from './questionRequest';

// Низкоуровневый клиент AI-прокси на api.bible.garden.
// Модель и системные инструкции выбираются и хранятся на сервере.
//
// Конфигурация — через .env.local (не коммитится, см. .gitignore):
//   EXPO_PUBLIC_AI_PROXY_URL=https://api.bible.garden/api/ai/question
//   EXPO_PUBLIC_AI_PROXY_KEY=… — отдельный ограниченный ключ прокси
//
// EXPO_PUBLIC_* зашиваются в бандл при сборке: после правки .env.local
// нужен перезапуск dev-сервера. Секретов уровня «мастер-ключ» тут быть
// не должно — все серверные секреты остаются в bible-api.

const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

// The backend model call may take up to 20 seconds; leave time for its 502 response.
const TIMEOUT_MS = 25_000;

export const llmConfigured = () => Boolean(PROXY_URL);

/**
 * Один вызов модели: структурированный диалог → текст ответа.
 * System prompt хранится на сервере и не может переопределяться клиентом.
 * Бросает при любой проблеме: не настроено, таймаут, не-2xx, пустой ответ.
 *
 */
export async function complete(request: QuestionRequest): Promise<string> {
  if (!PROXY_URL) throw new Error('AI proxy is not configured');

  const body = JSON.stringify(limitQuestionRequest(request));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(PROXY_KEY ? { 'x-api-key': PROXY_KEY } : {}),
      },
      body,
    });
    if (!res.ok) throw new Error(`AI proxy: HTTP ${res.status}`);

    const data = await res.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('AI proxy: empty response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Hard privacy barrier for prompts derived from a prayer session. */
export async function completePrayerContent(
  request: QuestionRequest,
): Promise<string> {
  // Lazy import keeps the transport independently testable in Node while the
  // app path still checks the live persisted gate immediately before fetch.
  const { answerContextAllowedNow, coreAiAllowedNow } = await import('./settings');
  if (!coreAiAllowedNow()) throw new Error('Core prayer AI consent is not allowed');
  if (request.messages.some((message) => message.role === 'user') && !answerContextAllowedNow()) {
    throw new Error('Answer context consent is not allowed');
  }
  return complete(request);
}

/**
 * Вызов, от которого ждём JSON. Модель иногда оборачивает ответ в
 * ```json-блок или добавляет фразу до/после — вырезаем первый JSON-фрагмент.
 */
export async function completeJson<T>(request: QuestionRequest): Promise<T> {
  const raw = await complete(request);
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error('AI proxy: no JSON in response');
  const opener = raw[start];
  const closer = opener === '[' ? ']' : '}';
  const end = raw.lastIndexOf(closer);
  if (end <= start) throw new Error('AI proxy: malformed JSON in response');
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
