/** Магазин, из которого установлена сборка: от него зависят пороги и ссылка на обновление. */
export type StorePlatform = 'ios' | 'android';

export type VersionCheck = {
  app: 'lampada';
  platform: StorePlatform;
  update_type: 'none' | 'soft' | 'hard';
  latest_version: string;
  store_url: string;
  message: { ru: string; en: string; uk: string } | null;
};

/**
 * Ответ принимается только для своего приложения и своей платформы: сервер без
 * поля `platform` (до раздельных iOS/Android-настроек) отдаёт ссылку App Store,
 * и Android-сборка не должна показывать её как обновление.
 */
export function parseVersionCheck(value: unknown, platform: StorePlatform): VersionCheck | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<VersionCheck>;
  if (data.app !== 'lampada' || data.platform !== platform) return null;
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
  endpoint: string | null, version: string, platform: StorePlatform, apiKey: string | undefined, signal: AbortSignal,
): Promise<VersionCheck | null> {
  if (!endpoint) return null;
  const url = new URL(endpoint);
  url.searchParams.set('app', 'lampada');
  url.searchParams.set('app_version', version);
  url.searchParams.set('platform', platform);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, 10_000);
  try {
    const response = await fetch(url.toString(), {
      headers: apiKey ? { 'x-api-key': apiKey } : undefined, signal: controller.signal,
    });
    return response.ok ? parseVersionCheck(await response.json(), platform) : null;
  } catch { return null; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
