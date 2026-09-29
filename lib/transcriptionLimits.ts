import { pluralCategory, type UiLanguage } from './uiLanguage.ts';

export const MAX_RECORDING_SECONDS = 600;
export const MAX_TRANSCRIPTION_BYTES = 14 * 1024 * 1024;

// AAC-LC кодирует по 1024 сэмпла: при 22 050 Гц кадр длится ~46 мс.
// Одна секунда запаса больше 21 кадра и покрывает округление последнего кадра.
export const NATIVE_STOP_HEADROOM_SECONDS = 1;

export function nativeRecordingStopSeconds(limitSeconds = MAX_RECORDING_SECONDS): number {
  if (limitSeconds <= NATIVE_STOP_HEADROOM_SECONDS) {
    throw new Error('Recording limit must exceed the native stop headroom');
  }
  return limitSeconds - NATIVE_STOP_HEADROOM_SECONDS;
}

export function remainingNativeRecordingSeconds(
  recordedMillis: number,
  limitSeconds = MAX_RECORDING_SECONDS,
): number {
  if (!Number.isFinite(recordedMillis) || recordedMillis < 0) {
    throw new Error('Recorded duration is invalid');
  }
  return Math.max(0, nativeRecordingStopSeconds(limitSeconds) - recordedMillis / 1000);
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

export function recordingSecondsRemaining(elapsedSeconds: number): number | null {
  const remaining = MAX_RECORDING_SECONDS - elapsedSeconds;
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

// Между установкой нативного forDuration и меткой JS возможен небольшой сдвиг.
export function recordingReachedLimit(
  expectedStopAtMillis: number | null,
  nowMillis: number,
): boolean {
  return expectedStopAtMillis !== null && nowMillis >= expectedStopAtMillis - 2_000;
}
