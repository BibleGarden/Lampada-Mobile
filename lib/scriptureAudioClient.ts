// The repository's native Node test runner requires explicit extensions.
// @ts-ignore Expo/Metro resolves TypeScript sources, while tsc disallows the suffix here.
import type { ScriptureDisplay } from './scripture.ts';
// @ts-ignore See note above.
import { resolveScriptureUrl, SCRIPTURE_REQUEST_TIMEOUT_MS } from './scriptureClient.ts';

const EXPLICIT_SCRIPTURE_URL = process.env.EXPO_PUBLIC_SCRIPTURE_SELECT_URL;
const COMPLETE_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const SCRIPTURE_API_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

export type ScriptureAudioClip = {
  url: string;
  startSeconds: number;
  endSeconds: number;
  verses: ScriptureAudioVerseTiming[];
};

export type ScriptureAudioVerseTiming = {
  number: number;
  startSeconds: number;
  endSeconds: number;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const resolveApiUrl = (path: string): URL | null => {
  const selectUrl = resolveScriptureUrl(EXPLICIT_SCRIPTURE_URL, COMPLETE_URL);
  if (!selectUrl) return null;
  try {
    const url = new URL(selectUrl);
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
};

const fetchJson = async (url: URL, signal?: AbortSignal): Promise<unknown> => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), SCRIPTURE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: SCRIPTURE_API_KEY ? { 'x-api-key': SCRIPTURE_API_KEY } : undefined,
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
};

const bookAliases = new Map<string, string>();

async function getBookAlias(
  translation: number,
  voice: number,
  bookNumber: number,
  chapterNumber: number,
  signal?: AbortSignal,
): Promise<string> {
  const key = `${translation}:${voice}:${bookNumber}:${chapterNumber}`;
  const cached = bookAliases.get(key);
  if (cached) return cached;

  const url = resolveApiUrl(`/api/translations/${translation}/books`);
  if (!url) throw new Error('not_configured');
  url.searchParams.set('voice_code', String(voice));
  const body = await fetchJson(url, signal);
  if (!Array.isArray(body)) throw new Error('invalid_response');
  const book = body.find(
    (item) => isObject(item) && item.book_number === bookNumber && typeof item.alias === 'string',
  );
  if (!isObject(book) || typeof book.alias !== 'string') throw new Error('audio_unavailable');
  if (
    Array.isArray(book.chapters_without_audio) &&
    book.chapters_without_audio.includes(chapterNumber)
  ) throw new Error('audio_unavailable');
  bookAliases.set(key, book.alias);
  return book.alias;
}

const publicAudioUrl = (rawUrl: string): string => {
  const base = resolveApiUrl('/');
  if (!base) throw new Error('not_configured');
  let audio: URL;
  try {
    const returned = new URL(rawUrl);
    audio = new URL(returned.pathname, base);
    returned.searchParams.forEach((value, key) => audio.searchParams.set(key, value));
  } catch {
    throw new Error('invalid_response');
  }
  if (SCRIPTURE_API_KEY && !audio.searchParams.has('api_key')) {
    audio.searchParams.set('api_key', SCRIPTURE_API_KEY);
  }
  return audio.toString();
};

export async function fetchScriptureAudioClip(
  scripture: ScriptureDisplay,
  voice: number,
  signal?: AbortSignal,
): Promise<ScriptureAudioClip> {
  const passage = scripture.selection.passage;
  const alias = await getBookAlias(
    passage.translation,
    voice,
    passage.book_number,
    passage.chapter_number,
    signal,
  );
  const url = resolveApiUrl('/api/excerpt_with_alignment');
  if (!url) throw new Error('not_configured');
  url.searchParams.set('translation', String(passage.translation));
  url.searchParams.set(
    'excerpt',
    `${alias} ${passage.chapter_number}:${passage.verse_start}-${passage.verse_end}`,
  );
  url.searchParams.set('voice', String(voice));

  const body = await fetchJson(url, signal);
  if (!isObject(body) || !Array.isArray(body.parts) || body.parts.length !== 1) {
    throw new Error('invalid_response');
  }
  const part = body.parts[0];
  if (!isObject(part) || typeof part.audio_link !== 'string' || !Array.isArray(part.verses)) {
    throw new Error('invalid_response');
  }
  const verses: ScriptureAudioVerseTiming[] = [];
  for (const verse of part.verses) {
    if (
      !isObject(verse) ||
      typeof verse.number !== 'number' ||
      verse.number < passage.verse_start ||
      verse.number > passage.verse_end ||
      !isFiniteNumber(verse.begin) ||
      !isFiniteNumber(verse.end)
    ) continue;
    verses.push({
      number: verse.number,
      startSeconds: verse.begin,
      endSeconds: verse.end,
    });
  }
  verses.sort((left, right) => left.startSeconds - right.startSeconds);
  const first = verses[0];
  const last = verses.at(-1);
  if (!first || !last) {
    throw new Error('audio_unavailable');
  }
  const startSeconds = Math.max(0, first.startSeconds - 0.2);
  if (last.endSeconds <= startSeconds) throw new Error('invalid_response');
  return {
    url: publicAudioUrl(part.audio_link),
    startSeconds,
    endSeconds: last.endSeconds,
    verses,
  };
}
