export type VersionCheck = {
  app: 'lampada';
  update_type: 'none' | 'soft' | 'hard';
  latest_version: string;
  store_url: string;
  message: { ru: string; en: string; uk: string } | null;
};

export function parseVersionCheck(value: unknown): VersionCheck | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<VersionCheck>;
  if (data.app !== 'lampada') return null;
  if (!['none', 'soft', 'hard'].includes(data.update_type ?? '')
    || typeof data.latest_version !== 'string' || typeof data.store_url !== 'string') return null;
  if (data.update_type !== 'none') {
    try {
      const url = new URL(data.store_url);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    } catch { return null; }
    if (!data.message || typeof data.message.ru !== 'string' || !data.message.ru.trim()) return null;
  }
  return data as VersionCheck;
}

export async function checkVersion(
  endpoint: string | null, version: string, apiKey: string | undefined, signal: AbortSignal,
): Promise<VersionCheck | null> {
  if (!endpoint) return null;
  const url = new URL(endpoint);
  url.searchParams.set('app', 'lampada');
  url.searchParams.set('app_version', version);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, 10_000);
  try {
    const response = await fetch(url.toString(), {
      headers: apiKey ? { 'x-api-key': apiKey } : undefined, signal: controller.signal,
    });
    return response.ok ? parseVersionCheck(await response.json()) : null;
  } catch { return null; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
