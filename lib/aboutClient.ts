import type { UiLanguage } from './uiLanguage';
import { resolveScriptureCatalogUrl } from './scriptureCatalogClient';

export type AboutContact = {
  id: string;
  icon: string;
  url: string;
  sortOrder: number;
  label: string;
  subtitle: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const localizedText = (value: Record<string, unknown>, language: UiLanguage): string => {
  for (const key of [language, 'en', 'ru']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }
  if ([language, 'en', 'ru'].some((key) => typeof value[key] === 'string')) return '';
  throw new Error('invalid_contact_translation');
};

export function parseAboutContacts(value: unknown, language: UiLanguage = 'ru'): AboutContact[] {
  if (!isObject(value) || !Array.isArray(value.contacts)) throw new Error('invalid_response');
  return value.contacts.map((item: unknown): AboutContact => {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.icon !== 'string'
      || typeof item.url !== 'string' || typeof item.sort_order !== 'number'
      || !Number.isFinite(item.sort_order) || !isObject(item.label)
      || !isObject(item.subtitle)) {
      throw new Error('invalid_contact');
    }
    if (!['https:', 'http:', 'mailto:', 'tg:'].includes(new URL(item.url).protocol)) {
      throw new Error('invalid_contact_url');
    }
    return {
      id: item.id, icon: item.icon, url: item.url, sortOrder: item.sort_order,
      label: localizedText(item.label, language),
      subtitle: localizedText(item.subtitle, language),
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function fetchAboutContacts(signal: AbortSignal, language: UiLanguage = 'ru'): Promise<AboutContact[]> {
  const endpoint = resolveScriptureCatalogUrl('/api/about');
  if (!endpoint) throw new Error('not_configured');
  const url = new URL(endpoint);
  url.searchParams.set('app', 'lampada');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, 10_000);
  try {
    const key = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
    const response = await fetch(url.toString(), {
      headers: key ? { 'x-api-key': key } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return parseAboutContacts(await response.json(), language);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
