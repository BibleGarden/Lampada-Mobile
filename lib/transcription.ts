import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { deviceLocale } from './transcriptionConfig';
import { apiPaths, resolveApiUrl } from './apiConfig';
import { recordingFileIssue } from './recordingFile';
import { audioTranscriptionAllowedNow } from './settings';

const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
const TIMEOUT_MS = 60_000;

export async function transcribeRecording(
  uri: string,
  _durationSec?: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!audioTranscriptionAllowedNow()) {
    throw new Error('Audio transcription consent is not allowed');
  }
  const url = resolveApiUrl(apiPaths.transcription);
  if (!url) throw new Error('Transcription proxy is not configured');

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const audio = new File(uri);
    const issue = recordingFileIssue(audio);
    if (issue) throw new Error(`Recording file is ${issue}`);
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
