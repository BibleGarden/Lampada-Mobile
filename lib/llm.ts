// Низкоуровневый клиент LLM-прокси. Единственное место, которое знает,
// как ходить по сети: адрес, ключ, формат запроса, таймаут.
//
// Конфигурация — через .env.local (не коммитится, см. .gitignore):
//   EXPO_PUBLIC_AI_PROXY_URL=https://…/v1/messages   — эндпоинт прокси
//   EXPO_PUBLIC_AI_PROXY_KEY=…                        — ключ доступа
//   EXPO_PUBLIC_AI_MODEL=claude-opus-4-8              — необязательно
//
// EXPO_PUBLIC_* зашиваются в бандл при сборке: после правки .env.local
// нужен перезапуск dev-сервера. Секретов уровня «мастер-ключ» тут быть
// не должно — прокси должен выдавать ограниченный клиентский ключ.

const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
const MODEL = process.env.EXPO_PUBLIC_AI_MODEL || 'claude-opus-4-8';

const TIMEOUT_MS = 12_000;

export const llmConfigured = () => Boolean(PROXY_URL);

/**
 * Один вызов модели: system + user → текст ответа.
 * Формат тела — Anthropic Messages API (прокси пробрасывает его дальше).
 * Бросает при любой проблеме: не настроено, таймаут, не-2xx, пустой ответ.
 */
export async function complete(system: string, user: string): Promise<string> {
  if (!PROXY_URL) throw new Error('AI proxy is not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(PROXY_KEY ? { authorization: `Bearer ${PROXY_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`AI proxy: HTTP ${res.status}`);

    const data = await res.json();
    // Anthropic-формат: content — массив блоков; берём текстовые.
    // .text у произвольного JSON нетипизирован, поэтому вручную
    const blocks: unknown = data?.content;
    const text = Array.isArray(blocks)
      ? blocks
          .map((b: any) => (b && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
          .join('')
          .trim()
      : '';
    if (!text) throw new Error('AI proxy: empty response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Вызов, от которого ждём JSON. Модель иногда оборачивает ответ в
 * ```json-блок или добавляет фразу до/после — вырезаем первый JSON-фрагмент.
 */
export async function completeJson<T>(system: string, user: string): Promise<T> {
  const raw = await complete(system, user);
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error('AI proxy: no JSON in response');
  const opener = raw[start];
  const closer = opener === '[' ? ']' : '}';
  const end = raw.lastIndexOf(closer);
  if (end <= start) throw new Error('AI proxy: malformed JSON in response');
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
