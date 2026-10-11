export type ScriptureAudioContinuation = {
  isCurrent: () => boolean;
};

/**
 * Invalidates async playback continuations when their Scripture context changes.
 * The audio-mode coordinator protects the process-wide session; this guard owns
 * the hook-local intent (stop, another excerpt/voice, or disabled playback).
 */
export function createScriptureAudioOperation() {
  let context: string | null = null;
  let generation = 0;

  return {
    setContext(nextContext: string | null) {
      if (context === nextContext) return;
      context = nextContext;
      generation += 1;
    },

    begin(): ScriptureAudioContinuation | null {
      if (context === null) return null;
      const expectedContext = context;
      const expectedGeneration = ++generation;
      return {
        isCurrent: () =>
          context === expectedContext && generation === expectedGeneration,
      };
    },

    invalidate() {
      generation += 1;
    },
  };
}

export type NarrationNativeStatus = {
  playing: boolean;
  isBuffering: boolean;
};

/**
 * How the native player relates to a narration the interface shows as playing.
 * `started` once it plays; `waiting` while it buffers or has not started yet;
 * `stopped` when a started player no longer plays: the system paused it
 * (for example, another app took the audio focus).
 */
export function narrationNativeState(
  status: NarrationNativeStatus,
  started: boolean,
): 'started' | 'waiting' | 'stopped' {
  if (status.playing) return 'started';
  if (status.isBuffering || !started) return 'waiting';
  return 'stopped';
}
