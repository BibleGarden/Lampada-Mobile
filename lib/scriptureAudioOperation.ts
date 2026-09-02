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
