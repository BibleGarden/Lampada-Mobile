export type NativePlaybackStatus = {
  playing: boolean;
  isBuffering: boolean;
  playbackState?: string;
};

/** Why a play() call did not turn into native playback. */
export type NativePlaybackStartFailure = 'not_started' | 'buffering_timeout';

type Timer = ReturnType<typeof setTimeout>;

// How often to poll the native player after play().
const POLL_MS = 200;
// How long to wait for playback to start when the player is not buffering.
export const NATIVE_START_TIMEOUT_MS = 2_000;
// Overall wait limit even if the player reports buffering the whole time:
// otherwise a stuck stream would stay "playing" forever.
export const NATIVE_START_BUFFERING_LIMIT_MS = 15_000;

/**
 * Watches that the native player actually started playing after play(). Android
 * silently ignores play() when the audio session is off, and a stream can
 * buffer forever, so the UI must not take play() at its word.
 * Returns a cancel function; onFailed fires at most once.
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
  /** A start already confirmed by a status event. */
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
