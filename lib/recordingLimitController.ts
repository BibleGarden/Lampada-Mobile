import { recordingLimitReached } from './transcriptionLimits.ts';

/** Один раз останавливает запись по нативному числу записанных миллисекунд. */
export function createRecordingLimitController(
  readRecordedMillis: () => number,
  isRecording: () => boolean,
  stop: () => Promise<boolean>,
  onFailure: (reason: 'status' | 'stop', error?: unknown) => void,
) {
  let state: 'ready' | 'stopping' | 'failed' | 'disposed' = 'ready';
  let generation = 0;
  const poll = (): boolean => {
    if (state !== 'ready' || !isRecording()) return false;
    try {
      if (!recordingLimitReached(readRecordedMillis())) return false;
    } catch (error) {
      state = 'failed';
      onFailure('status', error);
      return false;
    }
    state = 'stopping';
    const attempt = generation;
    let operation: Promise<boolean>;
    try {
      operation = stop();
    } catch (error) {
      state = 'failed';
      onFailure('stop', error);
      return true;
    }
    void operation
      .then((stopped) => {
        if (generation !== attempt || state === 'disposed') return;
        if (!stopped) {
          state = 'failed';
          onFailure('stop');
        }
      })
      .catch((error) => {
        if (generation !== attempt || state === 'disposed') return;
        state = 'failed';
        onFailure('stop', error);
      });
    return true;
  };
  return {
    reset() { generation += 1; state = 'ready'; },
    suspend() { state = 'stopping'; },
    dispose() { generation += 1; state = 'disposed'; },
    getState: () => state,
    poll,
    startPolling(
      schedule: (callback: () => void, millis: number) => ReturnType<typeof setInterval> = setInterval,
      cancel: (timer: ReturnType<typeof setInterval>) => void = clearInterval,
    ): () => void {
      if (state !== 'ready') return () => undefined;
      let timer: ReturnType<typeof setInterval> | null = null;
      const tick = () => {
        poll();
        if (state !== 'ready' && timer !== null) {
          cancel(timer);
          timer = null;
        }
      };
      tick();
      if (state === 'ready') timer = schedule(tick, 250);
      return () => { if (timer !== null) cancel(timer); };
    },
  };
}
