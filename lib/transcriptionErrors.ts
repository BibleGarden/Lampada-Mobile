export type TranscriptionErrorCode =
  | 'too_long'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'unavailable'
  | 'unknown';

export class TranscriptionError extends Error {
  readonly code: TranscriptionErrorCode;
  /** HTTP-статус ответа сервера, если сбой пришёл ответом. */
  readonly status?: number;

  constructor(code: TranscriptionErrorCode, options: { cause?: unknown; status?: number } = {}) {
    super(`Transcription failed: ${code}`, { cause: options.cause });
    this.name = 'TranscriptionError';
    this.code = code;
    this.status = options.status;
  }
}

export function transcriptionHttpError(status: number): TranscriptionError {
  if (status === 413) return new TranscriptionError('too_long', { status });
  if (status === 429) return new TranscriptionError('rate_limited', { status });
  if (status >= 500) return new TranscriptionError('unavailable', { status });
  return new TranscriptionError('unknown', { status });
}

export function transcriptionFailureCode(error: unknown): TranscriptionErrorCode {
  return error instanceof TranscriptionError ? error.code : 'unknown';
}

/**
 * Диагностика сбоя без текста сообщений: код категории, HTTP-статус и класс
 * исходной ошибки (для транспортных сбоев — класс причины).
 */
export function transcriptionFailureDetails(error: unknown): Record<string, string | number> {
  const source = error instanceof TranscriptionError && error.cause !== undefined ? error.cause : error;
  const details: Record<string, string | number> = {
    code: transcriptionFailureCode(error),
    errorClass: source instanceof Error ? source.name : typeof source,
  };
  if (error instanceof TranscriptionError && error.status !== undefined) details.status = error.status;
  return details;
}

export function transcriptionTransportError(
  error: unknown,
  timedOut: boolean,
  callerAborted: boolean,
): unknown {
  if (timedOut) return new TranscriptionError('timeout', { cause: error });
  if (callerAborted) return error;
  return new TranscriptionError('network', { cause: error });
}

export function transcriptionErrorMessageKey(code: TranscriptionErrorCode): string {
  switch (code) {
    case 'too_long': return 'components.answers.transcriptionTooLong';
    case 'rate_limited': return 'components.answers.transcriptionRateLimited';
    case 'timeout': return 'components.answers.transcriptionTimeout';
    case 'network': return 'components.answers.transcriptionNetwork';
    case 'unavailable': return 'components.answers.transcriptionUnavailable';
    case 'unknown': return 'components.answers.transcriptionFailed';
  }
}
