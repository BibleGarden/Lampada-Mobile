import { isPrefetchDenial, PrefetchDeniedError } from './prefetch.ts';
import { limitQuestionRequest } from './questionRequest';
import type { QuestionRequest } from './questionRequest';
import { apiPaths, resolveApiUrl } from './apiConfig.ts';

// Low-level client of the Bible-API AI proxy.
// The model and system instructions are chosen and stored on the server.
//
// Configuration goes through .env.local (not committed, see .gitignore):
//   EXPO_PUBLIC_API_URL=https://test-api.bible.garden (test server)
//   EXPO_PUBLIC_AI_PROXY_KEY=... — a separate restricted proxy key
//
// EXPO_PUBLIC_* values are baked into the bundle at build time: after
// editing .env.local the dev server must be restarted. There must be no
// master-key-grade secrets here — all server secrets stay in bible-api.

const PROXY_URL = resolveApiUrl(apiPaths.question);
const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

// The backend model call may take up to 20 seconds; leave time for its 502 response.
const TIMEOUT_MS = 25_000;

export const llmConfigured = () => Boolean(PROXY_URL);

/**
 * A single model call: structured dialog → response text.
 * The system prompt is stored on the server and cannot be overridden by
 * the client. Throws on any problem: not configured, timeout, non-2xx,
 * empty response.
 *
 */
export type QuestionResponse = { text: string; novel?: boolean };

export async function complete(request: QuestionRequest): Promise<string> {
  return (await completeQuestion(request)).text;
}

export async function completeQuestion(request: QuestionRequest): Promise<QuestionResponse> {
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
    if (!res.ok) {
      if (request.prefetch && res.status === 429) {
        const denial = await res.json();
        if (isPrefetchDenial(denial?.detail)) throw new PrefetchDeniedError();
      }
      throw new Error(`AI proxy: HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('AI proxy: empty response');
    return { text, ...(typeof data.novel === 'boolean' ? { novel: data.novel } : {}) };
  } finally {
    clearTimeout(timer);
  }
}

/** Hard privacy barrier for prompts derived from a prayer session. */
export async function completePrayerContent(
  request: QuestionRequest,
): Promise<QuestionResponse> {
  // Lazy import keeps the transport independently testable in Node while the
  // app path still checks the live persisted gate immediately before fetch.
  const { answerContextAllowedNow, coreAiAllowedNow, useSettings } = await import('./settings');
  if (!coreAiAllowedNow()) throw new Error('Core prayer AI consent is not allowed');
  if (request.messages.some((message) => message.role === 'user') && !answerContextAllowedNow()) {
    throw new Error('Answer context consent is not allowed');
  }
  // All question flows take the current UI language before sending.
  return completeQuestion({ ...request, default_language: useSettings.getState().uiLanguage });
}

/**
 * A call that expects JSON. The model sometimes wraps the answer in a
 * ```json block or adds a phrase before/after — cut out the first JSON fragment.
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
