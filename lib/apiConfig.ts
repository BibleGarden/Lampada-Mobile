export const apiPaths = {
  question: '/api/ai/question',
  transcription: '/api/ai/transcribe',
  scripture: '/api/ai/scripture',
  languages: '/api/languages',
  translations: '/api/translations',
  books: (translation: number) => `/api/translations/${translation}/books`,
  excerpt: '/api/excerpt_with_alignment',
  about: '/api/about',
  versionCheck: '/api/version-check',
} as const;

export function apiBaseUrl(value: string | undefined = process.env.EXPO_PUBLIC_API_URL): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveApiUrl(
  path: string,
  baseUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL,
): string | null {
  const base = apiBaseUrl(baseUrl);
  if (!base || !path.startsWith('/') || path.startsWith('//')) return null;
  const url = new URL(path, base);
  return url.origin === base ? url.toString() : null;
}
