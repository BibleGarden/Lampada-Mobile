export type NativePlaybackStatus = {
  playing: boolean;
  isBuffering: boolean;
  playbackState?: string;
};

/** Why a play() call did not turn into native playback. */
export type NativePlaybackStartFailure = 'not_started' | 'buffering_timeout';

type Timer = ReturnType<typeof setTimeout>;

// Как часто сверяться с нативным плеером после play().
const POLL_MS = 200;
// Сколько ждать начала воспроизведения, если плеер не буферизуется.
export const NATIVE_START_TIMEOUT_MS = 2_000;
// Общий предел ожидания, даже если плеер всё это время сообщает о буферизации:
// иначе зависший поток навсегда остался бы «играющим».
export const NATIVE_START_BUFFERING_LIMIT_MS = 15_000;

/**
 * Следит, что нативный плеер действительно начал играть после play(). Android
 * молча игнорирует play() при выключенной аудиосессии, а поток может бесконечно
 * буферизоваться, поэтому интерфейс не должен верить play() на слово.
 * Возвращает отмену; onFailed вызывается не больше одного раза.
 */
export function watchNativePlaybackStart({
  readStatus,
  hasStarted = () => false,
  onFailed,
  timeoutMs = NATIVE_START_TIMEOUT_MS,
  bufferingLimitMs = NATIVE_START_BUFFERING_LIMIT_MS,
  pollMs = POLL_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: {
  readStatus: () => NativePlaybackStatus;
  /** Начало, уже подтверждённое событием статуса. */
  hasStarted?: () => boolean;
  onFailed: (reason: NativePlaybackStartFailure, status: NativePlaybackStatus) => void;
  timeoutMs?: number;
  bufferingLimitMs?: number;
  pollMs?: number;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
}): () => void {
  let timer: Timer | null = null;
  let waited = 0;
  const check = () => {
    timer = null;
    waited += pollMs;
    if (hasStarted()) return;
    const status = readStatus();
    if (status.playing) return;
    if (status.isBuffering ? waited >= bufferingLimitMs : waited >= timeoutMs) {
      onFailed(status.isBuffering ? 'buffering_timeout' : 'not_started', status);
      return;
    }
    timer = setTimer(check, pollMs);
  };
  timer = setTimer(check, pollMs);
  return () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
}
