import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { deviceLocale } from './transcriptionConfig';
import { apiPaths, resolveApiUrl } from './apiConfig';
import { audioFileDurationSeconds } from './audioFileDuration';
import { validateTranscriptionFile } from './transcriptionPreflight';
import { audioTranscriptionAllowedNow } from './settings';
import { recordDiagnostic } from './db';
import {
  transcriptionFailureDetails,
  transcriptionHttpError,
  transcriptionTransportError,
} from './transcriptionErrors';

const PROXY_KEY = process.env.EXPO_PUBLIC_AI_PROXY_KEY;
const TIMEOUT_MS = 60_000;
// Рекордер пишет AAC в контейнере MPEG-4 (.m4a) на обеих платформах. Тип части
// задаём явно: Android по расширению .m4a подставляет audio/mpeg, и сервер
// отвечает 415.
const AUDIO_FILENAME = 'recording.m4a';
const AUDIO_MIME_TYPE = 'audio/mp4';

/** Собирает multipart-тело сами: FormData берёт тип части из таблицы MIME платформы. */
export function transcriptionRequestBody(
  audio: Uint8Array,
  locale: string | null,
  boundary = `LampadaTranscription${Math.random().toString(36).slice(2)}`,
): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="file"; filename="${AUDIO_FILENAME}"\r\n`
      + `Content-Type: ${AUDIO_MIME_TYPE}\r\n\r\n`,
  );
  const localePart = locale
    ? `\r\n--${boundary}\r\nContent-Disposition: form-data; name="locale"\r\n\r\n${locale}`
    : '';
  const tail = encoder.encode(`${localePart}\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + audio.length + tail.length);
  body.set(head);
  body.set(audio, head.length);
  body.set(tail, head.length + audio.length);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Пишет причину сбоя в консоль и диагностический журнал без аудио, текста и ключа. */
export function reportTranscriptionFailure(place: 'answer' | 'journal', error: unknown) {
  const details = transcriptionFailureDetails(error);
  console.warn('Failed to transcribe audio recording', { place, ...details });
  recordDiagnostic('transcription_failed', { place, ...details });
}

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
    await validateTranscriptionFile(audio, () => audioFileDurationSeconds(uri));
    const { body, contentType } = transcriptionRequestBody(await audio.bytes(), deviceLocale());

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': contentType, ...(PROXY_KEY ? { 'x-api-key': PROXY_KEY } : {}) },
        body,
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
