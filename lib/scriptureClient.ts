// The repository's native Node test runner requires the explicit extension.
// @ts-ignore Expo/Metro resolves TypeScript sources, while tsc disallows the suffix here.
import { parseScriptureSelection, type ScriptureRequest, type ScriptureSelection } from './scripture.ts';

export const SCRIPTURE_REQUEST_TIMEOUT_MS = 25_000;
export const DEFAULT_RETRY_AFTER_SECONDS = 30;

const EXPLICIT_SCRIPTURE_URL = process.env.EXPO_PUBLIC_SCRIPTURE_SELECT_URL;
const QUESTION_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const SCRIPTURE_API_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

export type ScriptureSelectError =
  | { kind: 'not_configured' }
  | { kind: 'cancelled' }
  | { kind: 'unauthorized' }
  | { kind: 'validation'; detail: string }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'unavailable'; status: number }
  | { kind: 'http'; status: number }
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'invalid_response' };

export type ScriptureSelectResult =
  | { ok: true; data: ScriptureSelection }
  | { ok: false; error: ScriptureSelectError };

export type ScriptureBookResponse = {
  bookNumber: number;
  name: string;
  alias: string;
  chaptersCount: number;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export type ScriptureClientDependencies = {
  url?: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  signal?: AbortSignal;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function resolveScriptureUrl(
  explicitUrl: string | undefined,
  questionUrl: string | undefined,
): string | null {
  const explicit = explicitUrl?.trim();
  if (explicit) return explicit;
  if (!questionUrl?.trim()) return null;

  try {
    const url = new URL(questionUrl);
    const derivedPath = url.pathname.replace(
      /\/api\/ai\/question\/?$/,
      '/api/ai/scripture',
    );
    if (derivedPath === url.pathname) return null;
    url.pathname = derivedPath;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export const scriptureConfigured = () =>
  resolveScriptureUrl(EXPLICIT_SCRIPTURE_URL, QUESTION_URL) !== null;

export function resolveScriptureBooksUrl(
  selectUrl: string | null,
  translation: number,
): string | null {
  if (!selectUrl) return null;
  try {
    const url = new URL(selectUrl);
    url.pathname = `/api/translations/${translation}/books`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

const parseRetryAfterSeconds = (headers: Headers): number => {
  const raw = headers.get('retry-after')?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_RETRY_AFTER_SECONDS;
  const seconds = Number(raw);
  return Number.isSafeInteger(seconds) ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
};

const readDetail = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return body.detail;
    }
  } catch {
    // The response body is intentionally not included in the returned error.
  }
  return '';
};

/** Performs exactly one HTTP request. Retry policy belongs to selectScripture(). */
export async function selectScriptureOnce(
  request: ScriptureRequest,
  dependencies: ScriptureClientDependencies = {},
): Promise<ScriptureSelectResult> {
  const url = dependencies.url === undefined
    ? resolveScriptureUrl(EXPLICIT_SCRIPTURE_URL, QUESTION_URL)
    : dependencies.url;
  if (!url) return { ok: false, error: { kind: 'not_configured' } };

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  dependencies.signal?.addEventListener('abort', cancel, { once: true });
  if (dependencies.signal?.aborted) controller.abort();
  const timer = setTimer(() => controller.abort(), SCRIPTURE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...((dependencies.apiKey ?? SCRIPTURE_API_KEY)
          ? { 'x-api-key': dependencies.apiKey ?? SCRIPTURE_API_KEY! }
          : {}),
      },
      body: JSON.stringify(request),
    });

    if (response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, error: { kind: 'invalid_response' } };
      }
      const data = parseScriptureSelection(body);
      return data
        ? { ok: true, data }
        : { ok: false, error: { kind: 'invalid_response' } };
    }

    if (response.status === 403) {
      return { ok: false, error: { kind: 'unauthorized' } };
    }
    if (response.status === 422) {
      return {
        ok: false,
        error: { kind: 'validation', detail: await readDetail(response) },
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        error: {
          kind: 'rate_limited',
          retryAfterSeconds: parseRetryAfterSeconds(response.headers),
        },
      };
    }
    if (response.status === 502 || response.status === 503) {
      return { ok: false, error: { kind: 'unavailable', status: response.status } };
    }
    return { ok: false, error: { kind: 'http', status: response.status } };
  } catch {
    return {
      ok: false,
      error: {
        kind: dependencies.signal?.aborted
          ? 'cancelled'
          : controller.signal.aborted
            ? 'timeout'
            : 'network',
      },
    };
  } finally {
    clearTimer(timer);
    dependencies.signal?.removeEventListener('abort', cancel);
  }
}

const waitForRetry = async (
  milliseconds: number,
  dependencies: ScriptureClientDependencies,
) => {
  if (dependencies.signal?.aborted) return false;
  if (!dependencies.signal) {
    await (dependencies.sleep ?? defaultSleep)(milliseconds);
    return true;
  }
  let cancel: (() => void) | undefined;
  const aborted = new Promise<false>((resolve) => {
    cancel = () => resolve(false);
    dependencies.signal!.addEventListener('abort', cancel, { once: true });
  });
  const completed = (dependencies.sleep ?? defaultSleep)(milliseconds).then(() => true);
  const result = await Promise.race([completed, aborted]);
  if (cancel) dependencies.signal.removeEventListener('abort', cancel);
  return result;
};

/** Runs retries sequentially, so this helper never has two requests in flight. */
export async function selectScripture(
  request: ScriptureRequest,
  dependencies: ScriptureClientDependencies = {},
): Promise<ScriptureSelectResult> {
  let rateLimitRetries = 0;
  let unavailableRetries = 0;
  let transportRetries = 0;

  while (true) {
    if (dependencies.signal?.aborted) {
      return { ok: false, error: { kind: 'cancelled' } };
    }
    const result = await selectScriptureOnce(request, dependencies);
    if (result.ok) return result;

    switch (result.error.kind) {
      case 'rate_limited':
        if (rateLimitRetries >= 1) return result;
        rateLimitRetries++;
        if (!await waitForRetry(result.error.retryAfterSeconds * 1000, dependencies)) {
          return { ok: false, error: { kind: 'cancelled' } };
        }
        break;
      case 'unavailable':
        if (unavailableRetries >= 2) return result;
        if (!await waitForRetry(unavailableRetries === 0 ? 2000 : 6000, dependencies)) {
          return { ok: false, error: { kind: 'cancelled' } };
        }
        unavailableRetries++;
        break;
      case 'network':
      case 'timeout':
        if (transportRetries >= 1) return result;
        transportRetries++;
        break;
      default:
        return result;
    }
  }
}

/** Fetches the translation's book-name catalog; callers persist it for offline references. */
export async function fetchScriptureBooks(
  translation: number,
  dependencies: ScriptureClientDependencies = {},
): Promise<ScriptureBookResponse[] | null> {
  const selectUrl = dependencies.url === undefined
    ? resolveScriptureUrl(EXPLICIT_SCRIPTURE_URL, QUESTION_URL)
    : dependencies.url;
  const url = resolveScriptureBooksUrl(selectUrl, translation);
  if (!url) return null;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  dependencies.signal?.addEventListener('abort', cancel, { once: true });
  if (dependencies.signal?.aborted) controller.abort();
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const timer = setTimer(() => controller.abort(), SCRIPTURE_REQUEST_TIMEOUT_MS);
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      headers: {
        ...((dependencies.apiKey ?? SCRIPTURE_API_KEY)
          ? { 'x-api-key': dependencies.apiKey ?? SCRIPTURE_API_KEY! }
          : {}),
      },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return null;
    const books: ScriptureBookResponse[] = [];
    for (const item of body) {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('book_number' in item) ||
        typeof item.book_number !== 'number' ||
        !('name' in item) ||
        typeof item.name !== 'string' ||
        !('alias' in item) ||
        typeof item.alias !== 'string' ||
        !('chapters_count' in item) ||
        typeof item.chapters_count !== 'number'
      ) {
        return null;
      }
      books.push({
        bookNumber: item.book_number,
        name: item.name,
        alias: item.alias,
        chaptersCount: item.chapters_count,
      });
    }
    return books;
  } catch {
    return null;
  } finally {
    clearTimer(timer);
    dependencies.signal?.removeEventListener('abort', cancel);
  }
}
