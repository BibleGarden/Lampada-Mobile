/** The store the build was installed from: update thresholds and the update link depend on it. */
export type StorePlatform = 'ios' | 'android';

export type VersionCheck = {
  app: 'lampada';
  platform: StorePlatform;
  update_type: 'none' | 'soft' | 'hard';
  latest_version: string;
  store_url: string;
  message: { ru: string; en: string; uk: string } | null;
};

/** Why the server response was not applied; the reason goes to diagnostics. */
export type VersionCheckRejection =
  | 'unconfigured' | 'network' | 'status' | 'invalid' | 'app-mismatch' | 'platform-mismatch';

export type VersionCheckResult =
  | { ok: true; check: VersionCheck }
  | { ok: false; reason: VersionCheckRejection; status?: number };

/**
 * The response is accepted only for our own app and platform: a server without
 * the `platform` field (before split iOS/Android settings) returns an App
 * Store link, and an Android build must not show it as an update.
 */
export function parseVersionCheck(value: unknown, platform: StorePlatform): VersionCheckResult {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'invalid' };
  const data = value as Partial<VersionCheck>;
  if (data.app !== 'lampada') return { ok: false, reason: 'app-mismatch' };
  if (data.platform !== platform) return { ok: false, reason: 'platform-mismatch' };
  if (!['none', 'soft', 'hard'].includes(data.update_type ?? '')
    || typeof data.latest_version !== 'string' || typeof data.store_url !== 'string') {
    return { ok: false, reason: 'invalid' };
  }
  if (data.update_type !== 'none') {
    try {
      const url = new URL(data.store_url);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
        return { ok: false, reason: 'invalid' };
      }
    } catch { return { ok: false, reason: 'invalid' }; }
    if (!data.message || typeof data.message.ru !== 'string' || !data.message.ru.trim()) {
      return { ok: false, reason: 'invalid' };
    }
  }
  return { ok: true, check: data as VersionCheck };
}

/**
 * The check never blocks the app on failure (ADR-0020), but it is not silent
 * either: the caller gets the rejection reason and records it to diagnostics.
 */
export async function checkVersion(
  endpoint: string | null, version: string, platform: StorePlatform, apiKey: string | undefined, signal: AbortSignal,
): Promise<VersionCheckResult> {
  if (!endpoint) return { ok: false, reason: 'unconfigured' };
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
    if (!response.ok) return { ok: false, reason: 'status', status: response.status };
    let body: unknown;
    try { body = await response.json(); } catch { return { ok: false, reason: 'invalid', status: response.status }; }
    return parseVersionCheck(body, platform);
  } catch { return { ok: false, reason: 'network' }; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
