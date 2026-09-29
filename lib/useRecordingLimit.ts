import { useEffect, useRef, useState } from 'react';
import type { RecordingDraft } from './store';
import type { RecordingOperationPhase, RecordingStartAttempt } from './recordingOperation';
import { createRecordingLimitController } from './recordingLimitController.ts';

type LimitFailure = 'status' | 'stop';

type RecordingLimitInputs = {
  recorder: { getStatus: () => { durationMillis: number } };
  phase: RecordingOperationPhase;
  isRecording: () => boolean;
  stopAtLimit: () => Promise<boolean>;
  stopAfterStatusFailure: () => Promise<boolean>;
  stopManually: () => Promise<RecordingDraft | null>;
  reportFailure: (reason: LimitFailure, error?: unknown) => void;
  schedule?: (callback: () => void, millis: number) => ReturnType<typeof setInterval>;
  cancel?: (timer: ReturnType<typeof setInterval>) => void;
};

type HookRuntime = {
  useEffect: typeof useEffect;
  useRef: typeof useRef;
  useState: typeof useState;
};

/** В тестах runtime подменяется, чтобы проверить весь жизненный цикл без UI. */
export function createUseRecordingLimit(runtime: HookRuntime) {
  return function useRecordingLimit(inputs: RecordingLimitInputs) {
    const [limitReached, setLimitReached] = runtime.useState(false);
    const [failure, setFailure] = runtime.useState<LimitFailure | null>(null);
    const inputsRef = runtime.useRef(inputs);
    inputsRef.current = inputs;
    const mountedRef = runtime.useRef(true);
    const controllerRef = runtime.useRef<ReturnType<typeof createRecordingLimitController> | null>(null);

    if (!controllerRef.current) {
      controllerRef.current = createRecordingLimitController(
        () => inputsRef.current.recorder.getStatus().durationMillis,
        () => inputsRef.current.isRecording(),
        () => {
          if (!inputsRef.current.isRecording()) return Promise.resolve(true);
          setLimitReached(true);
          return inputsRef.current.stopAtLimit();
        },
        (reason, error) => {
          if (!mountedRef.current) return;
          inputsRef.current.reportFailure(reason, error);
          setFailure(reason);
          if (reason === 'status') {
            void inputsRef.current.stopAfterStatusFailure()
              .then((stopped) => {
                if (!mountedRef.current || stopped) return;
                inputsRef.current.reportFailure('stop');
                setFailure('stop');
              })
              .catch((stopError) => {
                if (!mountedRef.current) return;
                inputsRef.current.reportFailure('stop', stopError);
                setFailure('stop');
              });
          }
        },
      );
    }
    const controller = controllerRef.current;

    runtime.useEffect(() => {
      if (inputs.phase !== 'recording') return;
      return controller.startPolling(inputs.schedule, inputs.cancel);
    }, [inputs.phase, controller]);
    runtime.useEffect(() => () => {
      mountedRef.current = false;
      controller.dispose();
    }, [controller]);

    return {
      overlayProps: {
        limitReached,
        limitError: failure === null
          ? null
          : failure === 'status'
            ? 'components.answers.limitStatusFailed'
            : 'components.answers.limitStopFailed',
      },
      commitStart(attempt: RecordingStartAttempt): boolean {
        const started = attempt.commit();
        if (started) {
          controller.reset();
          setLimitReached(false);
          setFailure(null);
        }
        return started;
      },
      async manualStop(): Promise<RecordingDraft | null> {
        controller.suspend();
        const draft = await inputsRef.current.stopManually();
        if (!draft && inputsRef.current.isRecording()) {
          inputsRef.current.reportFailure('stop');
          setFailure('stop');
        }
        return draft;
      },
    };
  };
}

export const useRecordingLimit = createUseRecordingLimit({ useEffect, useRef, useState });
