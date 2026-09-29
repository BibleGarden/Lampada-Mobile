import { pluralCategory, type UiLanguage } from './uiLanguage.ts';

export const MAX_RECORDING_SECONDS = 600;
export const MAX_TRANSCRIPTION_BYTES = 14 * 1024 * 1024;

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

export function recordingSecondsRemaining(elapsedSeconds: number): number | null {
  const remaining = MAX_RECORDING_SECONDS - elapsedSeconds;
  return remaining <= 60 ? Math.max(0, remaining) : null;
}

export function recordingExceedsUploadLimit(size: number): boolean {
  return size > MAX_TRANSCRIPTION_BYTES;
}

export function recordingExceedsDurationLimit(
  durationSeconds: number | undefined,
  limitSeconds = MAX_RECORDING_SECONDS,
): boolean {
  return durationSeconds !== undefined && durationSeconds > limitSeconds;
}

// Между нативным стартом и меткой JS возможен сдвиг; более раннее завершение
// считаем прерыванием, а не штатным достижением предела.
export function recordingReachedLimit(
  startedAtMillis: number | null,
  nowMillis: number,
  limitSeconds = MAX_RECORDING_SECONDS,
): boolean {
  return startedAtMillis !== null &&
    nowMillis - startedAtMillis >= (limitSeconds - 2) * 1000;
}
