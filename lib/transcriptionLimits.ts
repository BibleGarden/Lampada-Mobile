import { pluralCategory, type UiLanguage } from './uiLanguage.ts';

export const MAX_RECORDING_SECONDS = 600;
export const MAX_TRANSCRIPTION_BYTES = 14 * 1024 * 1024;

// Останавливаем до серверных 600 с: последнему кадру AAC нужен запас.
export const RECORDING_STOP_HEADROOM_SECONDS = 1;

export function recordingStopSeconds(limitSeconds = MAX_RECORDING_SECONDS): number {
  if (limitSeconds <= RECORDING_STOP_HEADROOM_SECONDS) {
    throw new Error('Recording limit must exceed the stop headroom');
  }
  return limitSeconds - RECORDING_STOP_HEADROOM_SECONDS;
}

export function recordingLimitReached(
  recordedMillis: number,
  limitSeconds = MAX_RECORDING_SECONDS,
): boolean {
  if (!Number.isFinite(recordedMillis) || recordedMillis < 0) {
    throw new Error('Recorded duration is invalid');
  }
  return recordedMillis >= recordingStopSeconds(limitSeconds) * 1000;
}

export function recordingLimitDisplay(
  limitSeconds: number,
  language: UiLanguage,
): { count: number; unitKey: string } {
  if (limitSeconds <= 0 || !Number.isInteger(limitSeconds)) {
    throw new Error('Recording limit must be a positive whole number of seconds');
  }
  const inMinutes = limitSeconds % 60 === 0;
  const count = inMinutes ? limitSeconds / 60 : limitSeconds;
  const unit = inMinutes ? 'screens.minute' : 'components.answers.second';
  return { count, unitKey: `${unit}.${pluralCategory(language, count)}` };
}

export function recordingSecondsRemaining(
  elapsedSeconds: number,
  stoppedAtLimit = false,
): number | null {
  if (stoppedAtLimit) return 0;
  const remaining = recordingStopSeconds() - elapsedSeconds;
  return remaining <= 60 ? Math.max(0, remaining) : null;
}

export function recordingExceedsUploadLimit(size: number): boolean {
  return size > MAX_TRANSCRIPTION_BYTES;
}

export function recordingExceedsDurationLimit(
  durationSeconds: number,
  limitSeconds = MAX_RECORDING_SECONDS,
): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Audio duration is invalid');
  }
  return durationSeconds > limitSeconds;
}
