import { recordingLimitReached } from './transcriptionLimits.ts';

/** Один раз останавливает запись по нативному числу записанных миллисекунд. */
export function createRecordingLimitController(
  readRecordedMillis: () => number,
  isRecording: () => boolean,
  stop: () => void,
) {
  let triggered = false;
  const poll = (): boolean => {
    if (triggered || !isRecording()) return false;
    if (!recordingLimitReached(readRecordedMillis())) return false;
    triggered = true;
    stop();
    return true;
  };
  return {
    reset() { triggered = false; },
    poll,
    startPolling(
      onError: (error: unknown) => void,
      schedule: (callback: () => void, millis: number) => ReturnType<typeof setInterval> = setInterval,
      cancel: (timer: ReturnType<typeof setInterval>) => void = clearInterval,
    ): () => void {
      const tick = () => {
        try { poll(); }
        catch (error) { onError(error); }
      };
      tick();
      const timer = schedule(tick, 250);
      return () => cancel(timer);
    },
  };
}
