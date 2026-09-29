type CueStatus = { error: string | null; didJustFinish: boolean };
type CuePlayer = {
  addListener: (
    event: 'playbackStatusUpdate',
    listener: (status: CueStatus) => void,
  ) => { remove: () => void };
  play: () => void;
  pause: () => void;
};

/** Отмена и устаревший playback grant завершают сигнал без ошибки. */
export function playCueUntilComplete(
  player: CuePlayer,
  isCurrent: () => boolean,
  checkIntervalMillis = 50,
  timeoutMillis = 5_000,
): { promise: Promise<void>; cancel: () => void } {
  let cancel: () => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let subscription: { remove: () => void } | null = null;
    let monitor: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (monitor) clearInterval(monitor);
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      try {
        player.pause();
      } catch (pauseError) {
        reject(pauseError);
        return;
      }
      if (error) reject(error);
      else resolve();
    };
    cancel = () => settle();
    monitor = setInterval(() => { if (!isCurrent()) settle(); }, checkIntervalMillis);
    timeout = setTimeout(() => {
      if (!isCurrent()) settle();
      else settle(new Error('Recording limit cue did not finish'));
    }, timeoutMillis);
    try {
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!isCurrent()) settle();
        else if (status.error) settle(new Error(status.error));
        else if (status.didJustFinish) settle();
      });
      if (settled) { subscription.remove(); return; }
      player.play();
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { promise, cancel: () => cancel() };
}
