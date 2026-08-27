// The repository's native Node test runner requires the explicit extension.
// @ts-ignore Expo/Metro resolves TypeScript sources, while tsc disallows the suffix here.
import type { ScriptureLanguage } from './scripture.ts';
// @ts-ignore See note above.
import type { ScriptureLanguageOption, ScriptureTranslation, ScriptureVoice } from './scripturePreferences.ts';
// @ts-ignore See note above.
import { resolveScriptureUrl, SCRIPTURE_REQUEST_TIMEOUT_MS } from './scriptureClient.ts';

const EXPLICIT_SCRIPTURE_URL = process.env.EXPO_PUBLIC_SCRIPTURE_SELECT_URL;
const COMPLETE_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const SCRIPTURE_API_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCode = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isLanguage = (value: unknown): value is ScriptureLanguage =>
  typeof value === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(value);

export function parseScriptureLanguages(value: unknown): ScriptureLanguageOption[] | null {
  if (!Array.isArray(value)) return null;
  const result: ScriptureLanguageOption[] = [];
  for (const item of value) {
    if (
      !isObject(item) ||
      !isLanguage(item.alias) ||
      typeof item.name_en !== 'string' ||
      typeof item.name_national !== 'string'
    ) return null;
    result.push({
      alias: item.alias,
      nameEnglish: item.name_en,
      nameNational: item.name_national,
    });
  }
  return result;
}

function parseVoice(value: unknown): ScriptureVoice | null {
  if (
    !isObject(value) ||
    !isCode(value.code) ||
    typeof value.alias !== 'string' ||
    typeof value.name !== 'string' ||
    (value.description !== undefined && value.description !== null && typeof value.description !== 'string') ||
    typeof value.is_music !== 'boolean' ||
    typeof value.active !== 'boolean'
  ) return null;
  if (!value.active) return null;
  return {
    code: value.code,
    alias: value.alias,
    name: value.name,
    description: value.description ?? null,
    isMusic: value.is_music,
  };
}

export function parseScriptureTranslations(value: unknown): ScriptureTranslation[] | null {
  if (!Array.isArray(value)) return null;
  const result: ScriptureTranslation[] = [];
  for (const item of value) {
    if (
      !isObject(item) ||
      !isCode(item.code) ||
      typeof item.alias !== 'string' ||
      typeof item.name !== 'string' ||
      (item.description !== undefined && item.description !== null && typeof item.description !== 'string') ||
      !isLanguage(item.language) ||
      typeof item.active !== 'boolean' ||
      !Array.isArray(item.voices)
    ) return null;
    if (!item.active) continue;
    const voices = item.voices.flatMap((voice) => {
      const parsed = parseVoice(voice);
      return parsed ? [parsed] : [];
    });
    result.push({
      code: item.code,
      alias: item.alias,
      name: item.name,
      description: item.description ?? null,
      language: item.language,
      voices,
    });
  }
  return result;
}

export function resolveScriptureCatalogUrl(path: string): string | null {
  const selectUrl = resolveScriptureUrl(EXPLICIT_SCRIPTURE_URL, COMPLETE_URL);
  if (!selectUrl) return null;
  try {
    const url = new URL(selectUrl);
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchCatalog<T>(
  url: string | null,
  parse: (value: unknown) => T | null,
  signal?: AbortSignal,
): Promise<T> {
  if (!url) throw new Error('not_configured');
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
    const parsed = parse(await response.json());
    if (parsed === null) throw new Error('invalid_response');
    return parsed;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export const fetchScriptureLanguages = (signal?: AbortSignal) =>
  fetchCatalog(resolveScriptureCatalogUrl('/api/languages'), parseScriptureLanguages, signal);

export const fetchScriptureTranslations = (language: ScriptureLanguage, signal?: AbortSignal) => {
  const raw = resolveScriptureCatalogUrl('/api/translations');
  if (!raw) return fetchCatalog<ScriptureTranslation[]>(null, parseScriptureTranslations, signal);
  const url = new URL(raw);
  url.searchParams.set('language', language);
  url.searchParams.set('only_active', '1');
  return fetchCatalog(url.toString(), parseScriptureTranslations, signal);
};
