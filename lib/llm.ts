// Низкоуровневый клиент нашего Gemini-прокси на api.bible.garden.
// Ключ Google AI Studio хранится только на сервере.
//
// Конфигурация — через .env.local (не коммитится, см. .gitignore):
//   EXPO_PUBLIC_AI_PROXY_URL=https://api.bible.garden/api/lampada/v1/complete
//   EXPO_PUBLIC_AI_PROXY_KEY=… — отдельный ограниченный ключ прокси
//
// EXPO_PUBLIC_* зашиваются в бандл при сборке: после правки .env.local
// нужен перезапуск dev-сервера. Секретов уровня «мастер-ключ» тут быть
// не должно — ключ Google и другие серверные секреты остаются в bible-api.

const PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

// Backend itself waits up to 20 seconds for Gemini; leave time for its 502 response.
const TIMEOUT_MS = 25_000;

export const llmConfigured = () => Boolean(PROXY_URL);

/**
 * Один вызов модели: user → текст ответа.
 * Формат тела — внутренний контракт bible-api: { user } → { text }.
 * System prompt хранится на сервере и не может переопределяться клиентом.
 * Бросает при любой проблеме: не настроено, таймаут, не-2xx, пустой ответ.
 *
 */
export async function complete(user: string): Promise<string> {
  if (!PROXY_URL) throw new Error('AI proxy is not configured');

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
      body: JSON.stringify({ user }),
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

/**
 * Вызов, от которого ждём JSON. Модель иногда оборачивает ответ в
 * ```json-блок или добавляет фразу до/после — вырезаем первый JSON-фрагмент.
 */
export async function completeJson<T>(user: string): Promise<T> {
  const raw = await complete(user);
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error('AI proxy: no JSON in response');
  const opener = raw[start];
  const closer = opener === '[' ? ']' : '}';
  const end = raw.lastIndexOf(closer);
  if (end <= start) throw new Error('AI proxy: malformed JSON in response');
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
