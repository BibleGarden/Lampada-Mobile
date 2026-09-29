export type TranscriptionErrorCode =
  | 'too_long'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'unavailable'
  | 'unknown';

export class TranscriptionError extends Error {
  readonly code: TranscriptionErrorCode;

  constructor(code: TranscriptionErrorCode, cause?: unknown) {
    super(`Transcription failed: ${code}`, { cause });
    this.name = 'TranscriptionError';
    this.code = code;
  }
}

export function transcriptionHttpError(status: number): TranscriptionError {
  if (status === 413) return new TranscriptionError('too_long');
  if (status === 429) return new TranscriptionError('rate_limited');
  if (status >= 500) return new TranscriptionError('unavailable');
  return new TranscriptionError('unknown', new Error(`HTTP ${status}`));
}

export function transcriptionFailureCode(error: unknown): TranscriptionErrorCode {
  return error instanceof TranscriptionError ? error.code : 'unknown';
}

export function transcriptionTransportError(
  error: unknown,
  timedOut: boolean,
  callerAborted: boolean,
): unknown {
  if (timedOut) return new TranscriptionError('timeout', error);
  if (callerAborted) return error;
  return new TranscriptionError('network', error);
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
