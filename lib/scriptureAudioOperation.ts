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

export type ScriptureAudioPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'interrupted' | 'error';

type NarrationInterruptionEvent =
  | { type: 'status'; status: NarrationNativeStatus; liveStatus: NarrationNativeStatus; started: boolean }
  | { type: 'resume_requested' }
  | { type: 'resume_denied' };

/** Решение о фазе и lease общее для системной паузы и ручного возобновления. */
export function narrationInterruptionTransition(
  phase: ScriptureAudioPhase,
  event: NarrationInterruptionEvent,
): { phase: ScriptureAudioPhase; session: 'retain' | 'acquire' | 'release'; audioBusy: boolean } | null {
  if (event.type === 'resume_requested') {
    return { phase: 'loading', session: phase === 'interrupted' ? 'retain' : 'acquire', audioBusy: true };
  }
  if (event.type === 'resume_denied') {
    const interrupted = phase === 'interrupted';
    return { phase, session: interrupted ? 'retain' : 'release', audioBusy: interrupted };
  }
  if (phase === 'interrupted' && event.status.playing && event.liveStatus.playing) {
    return { phase: 'playing', session: 'retain', audioBusy: true };
  }
  if (phase === 'playing'
    && narrationNativeState(event.status, event.started) === 'stopped'
    && narrationNativeState(event.liveStatus, true) === 'stopped') {
    return { phase: 'interrupted', session: 'retain', audioBusy: true };
  }
  return null;
}

/** Подсветка сохраняется и при системной паузе между стихами. */
export function narrationActiveVerse(
  phase: ScriptureAudioPhase,
  verses: readonly { number: number; startSeconds: number; endSeconds: number }[],
  currentTime: number,
): number | null {
  if ((phase !== 'playing' && phase !== 'paused' && phase !== 'interrupted') || verses.length === 0) return null;
  let active = verses[0].number;
  for (let index = 1; index < verses.length; index++) {
    const switchTime = (verses[index - 1].endSeconds + verses[index].startSeconds) / 2;
    if (currentTime + 0.03 < switchTime) break;
    active = verses[index].number;
  }
  return active;
}

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
