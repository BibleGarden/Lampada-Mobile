import { nativeRecordingStopSeconds, recordingReachedLimit, remainingNativeRecordingSeconds } from './transcriptionLimits.ts';

export type RecordingOperationPhase = 'idle' | 'starting' | 'recording' | 'stopping';

export type RecordingStartAttempt = {
  isCurrent: () => boolean;
  commit: () => boolean;
  /** Keeps recovery UI in recording when native cleanup could not be confirmed. */
  recoverAsRecording: () => boolean;
  finish: () => void;
};

export type RecordingOperation = ReturnType<typeof createRecordingOperation>;

export type RecordingLeaseRelease = {
  release: () => boolean;
};

export type PreparedRecorder = {
  record: (options?: { forDuration: number }) => void;
  readonly isRecording: boolean;
};

export type ResumableRecorder = PreparedRecorder & {
  pause: () => void;
  getStatus: () => { durationMillis: number };
};

export type RecorderTerminalStatus = {
  isFinished: boolean;
  hasError: boolean;
  mediaServicesDidReset?: boolean;
};

export function recorderStatusRequiresRecovery(
  phase: RecordingOperationPhase,
  status: RecorderTerminalStatus,
) {
  if (status.mediaServicesDidReset || status.hasError) return phase !== 'idle';
  return status.isFinished && phase === 'recording';
}

/** Штатный нативный автостоп передаёт управление сохранению черновика. */
export function handleRecorderTerminalStatus(
  phase: RecordingOperationPhase,
  status: RecorderTerminalStatus,
  nativeIsRecording: boolean,
  expectedStopAtMillis: number | null,
  nowMillis: number,
  onLimit: () => void,
): boolean {
  if (status.isFinished && !status.hasError && !status.mediaServicesDidReset) {
    if (nativeIsRecording) return false;
    if (phase === 'recording' && recordingReachedLimit(expectedStopAtMillis, nowMillis)) {
      onLimit();
      return false;
    }
  }
  return recorderStatusRequiresRecovery(phase, status);
}

/** Starts once; a failed native start is cleaned up before the user retries. */
export function startPreparedRecording(recorder: PreparedRecorder, limitSeconds?: number): number {
  const duration = nativeRecordingStopSeconds(limitSeconds);
  recorder.record({ forDuration: duration });
  if (!recorder.isRecording) {
    throw new Error('Native audio recorder did not enter recording state');
  }
  return duration;
}

/** После фоновой паузы Expo возобновляет record() без прежнего forDuration. */
export function rearmRecordingAfterForeground(
  recorder: ResumableRecorder,
  limitSeconds?: number,
): number {
  if (recorder.isRecording) recorder.pause();
  const remaining = remainingNativeRecordingSeconds(recorder.getStatus().durationMillis, limitSeconds);
  if (remaining === 0) return 0;
  recorder.record({ forDuration: remaining });
  if (!recorder.isRecording) throw new Error('Native recorder did not resume');
  return remaining;
}

/**
 * Coordinates recorder lifecycle operations without relying on delayed native
 * status updates. A pending start is dropped rather than queued, while every
 * caller racing to stop shares the same promise.
 */
export function createRecordingOperation(
  onPhaseChange: (phase: RecordingOperationPhase) => void = () => undefined,
) {
  type StartToken = { cancelled: boolean };

  let phase: RecordingOperationPhase = 'idle';
  let startToken: StartToken | null = null;
  let stopPromise: Promise<unknown> | null = null;
  let lifecycleGeneration = 0;

  const setPhase = (next: RecordingOperationPhase) => {
    phase = next;
    onPhaseChange(next);
  };

  return {
    getPhase: () => phase,
    getPendingStop: () => stopPromise,

    beginStart(): RecordingStartAttempt | null {
      // A terminal interruption can make the UI idle before an older native
      // stop promise settles. Do not let a new recorder lifecycle overlap it.
      if (phase !== 'idle' || stopPromise) return null;

      const token: StartToken = { cancelled: false };
      startToken = token;
      setPhase('starting');

      const isCurrent = () =>
        startToken === token && !token.cancelled && phase === 'starting';

      return {
        isCurrent,
        commit: () => {
          if (!isCurrent()) return false;
          startToken = null;
          setPhase('recording');
          return true;
        },
        recoverAsRecording: () => {
          if (startToken !== token || phase !== 'starting') return false;
          startToken = null;
          setPhase('recording');
          return true;
        },
        finish: () => {
          if (startToken !== token) return;
          startToken = null;
          if (phase === 'starting') setPhase('idle');
        },
      };
    },

    cancelStart() {
      if (phase === 'starting' && startToken) startToken.cancelled = true;
    },

    interrupt() {
      if (phase === 'idle') return false;
      lifecycleGeneration += 1;
      if (startToken) startToken.cancelled = true;
      startToken = null;
      setPhase('idle');
      return true;
    },

    runStop<T>(operation: (confirmNativeStop: () => void) => Promise<T>): Promise<T | null> {
      if (stopPromise) return stopPromise as Promise<T | null>;
      if (phase !== 'recording') return Promise.resolve(null);

      setPhase('stopping');
      const generation = lifecycleGeneration;
      let nativeStopConfirmed = false;
      let shared!: Promise<T>;
      shared = operation(() => {
        nativeStopConfirmed = true;
      })
        .then((result) => {
          if (generation === lifecycleGeneration && phase === 'stopping') {
            setPhase('idle');
          }
          return result;
        })
        .catch((error) => {
          if (generation === lifecycleGeneration && phase === 'stopping') {
            // Only an error before the acknowledgement means the native
            // recorder may still be running. File/post-processing failures
            // happen after a confirmed stop and must not resurrect the UI.
            setPhase(nativeStopConfirmed ? 'idle' : 'recording');
          }
          throw error;
        })
        .finally(() => {
          if (stopPromise === shared) stopPromise = null;
        });
      stopPromise = shared;
      return shared;
    },
  };
}

/** Ends the JS lifecycle and recording lease after a terminal native error/reset. */
export function recoverRecordingAfterTerminalError(
  operation: Pick<RecordingOperation, 'interrupt'>,
  lease: RecordingLeaseRelease | null,
) {
  operation.interrupt();
  return lease?.release() ?? false;
}
