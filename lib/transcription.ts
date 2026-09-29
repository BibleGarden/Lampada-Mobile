import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { deviceLocale } from './transcriptionConfig';
import { apiPaths, resolveApiUrl } from './apiConfig';
import { recordingFileIssue } from './recordingFile';
import { audioFileDurationSeconds } from './audioFileDuration';
import { audioTranscriptionAllowedNow } from './settings';
import { recordingExceedsDurationLimit, recordingExceedsUploadLimit } from './transcriptionLimits';
import { TranscriptionError, transcriptionHttpError, transcriptionTransportError } from './transcriptionErrors';

const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
const TIMEOUT_MS = 60_000;

export async function transcribeRecording(
  uri: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!audioTranscriptionAllowedNow()) {
    throw new Error('Audio transcription consent is not allowed');
  }
  const url = resolveApiUrl(apiPaths.transcription);
  if (!url) throw new Error('Transcription proxy is not configured');

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const audio = new File(uri);
    const issue = recordingFileIssue(audio);
    if (issue) throw new Error(`Recording file is ${issue}`);
    if (audio.size === null) throw new Error('Recording file size is unavailable');
    if (recordingExceedsUploadLimit(audio.size)) throw new TranscriptionError('too_long');
    if (recordingExceedsDurationLimit(await audioFileDurationSeconds(uri))) {
      throw new TranscriptionError('too_long');
    }
    const form = new FormData();
    form.append('file', audio, audio.name || 'recording.m4a');
    const locale = deviceLocale();
    if (locale) form.append('locale', locale);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: PROXY_KEY ? { 'x-api-key': PROXY_KEY } : undefined,
        body: form,
      });
    } catch (error) {
      throw transcriptionTransportError(error, timedOut, !!signal?.aborted);
    }
    if (!response.ok) throw transcriptionHttpError(response.status);

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (timedOut) throw transcriptionTransportError(error, true, !!signal?.aborted);
      if (error instanceof SyntaxError) throw error;
      throw transcriptionTransportError(error, timedOut, !!signal?.aborted);
    }
    const text = data && typeof data === 'object' && 'text' in data && typeof data.text === 'string'
      ? data.text.trim()
      : '';
    if (!text) throw new Error('Transcription proxy returned no text');
    return text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
