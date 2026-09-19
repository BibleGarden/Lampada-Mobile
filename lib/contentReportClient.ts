// The repository's Node tests require the explicit extension.
// @ts-ignore Expo/Metro resolves TypeScript sources, while tsc disallows the suffix here.
import { apiPaths, resolveApiUrl } from './apiConfig.ts';
import type { UiLanguage } from './uiLanguage';

export const CONTENT_REPORT_TIMEOUT_MS = 15_000;

export type ContentReportRequest = {
  content_type: 'question' | 'scripture';
  content_text: string;
  user_comment?: string;
  language: UiLanguage;
};

export type ContentReportError =
  | 'not_configured'
  | 'unauthorized'
  | 'validation'
  | 'unavailable'
  | 'http'
  | 'network'
  | 'timeout'
  | 'invalid_response';

export type ContentReportResult =
  | { ok: true; reportId: number }
  | { ok: false; error: ContentReportError };

type TimerHandle = ReturnType<typeof setTimeout>;

export type ContentReportDependencies = {
  url?: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

const defaultApiKey = process.env.EXPO_PUBLIC_AI_PROXY_KEY;

export async function sendContentReport(
  report: ContentReportRequest,
  dependencies: ContentReportDependencies = {},
): Promise<ContentReportResult> {
  const url = dependencies.url === undefined
    ? resolveApiUrl(apiPaths.contentReports)
    : dependencies.url;
  if (!url) return { ok: false, error: 'not_configured' };

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const controller = new AbortController();
  const timer = setTimer(() => controller.abort(), CONTENT_REPORT_TIMEOUT_MS);
  const apiKey = dependencies.apiKey ?? defaultApiKey;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      if (response.status === 403) return { ok: false, error: 'unauthorized' };
      if (response.status === 413 || response.status === 422) {
        return { ok: false, error: 'validation' };
      }
      if (response.status === 500 || response.status === 502 || response.status === 503) {
        return { ok: false, error: 'unavailable' };
      }
      return { ok: false, error: 'http' };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: 'invalid_response' };
    }
    if (
      typeof body !== 'object' || body === null ||
      !('status' in body) || body.status !== 'ok' ||
      !('report_id' in body) || typeof body.report_id !== 'number' ||
      !Number.isSafeInteger(body.report_id) || body.report_id < 1
    ) {
      return { ok: false, error: 'invalid_response' };
    }
    return { ok: true, reportId: body.report_id };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimer(timer);
  }
}
