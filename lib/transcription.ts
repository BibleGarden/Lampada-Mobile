import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { deviceLocale, resolveTranscriptionUrl } from './transcriptionConfig';

const TRANSCRIPTION_URL = process.env.EXPO_PUBLIC_AI_TRANSCRIBE_URL;
const COMPLETE_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
const TIMEOUT_MS = 60_000;

export async function transcribeRecording(
  uri: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = resolveTranscriptionUrl(TRANSCRIPTION_URL, COMPLETE_URL);
  if (!url) throw new Error('Transcription proxy is not configured');

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const audio = new File(uri);
    const form = new FormData();
    form.append('file', audio, audio.name || 'recording.m4a');
    const locale = deviceLocale();
    if (locale) form.append('locale', locale);

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: PROXY_KEY ? { 'x-api-key': PROXY_KEY } : undefined,
      body: form,
    });
    if (!response.ok) throw new Error(`Transcription proxy: HTTP ${response.status}`);

    const data = await response.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('Transcription proxy returned no text');
    return text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
