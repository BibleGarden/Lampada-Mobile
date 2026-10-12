import type { ScriptureAudioPhase } from './useScriptureAudio';

type CompletionState = {
  timeExpired: boolean;
  screenVisible: boolean;
  activityOpen: boolean;
};

type SessionActivityState = {
  readerOpen: boolean;
  answerOpen: boolean;
  reportOpen: boolean;
  scriptureAudioPhase: ScriptureAudioPhase;
};

export function hasSessionActivity({
  readerOpen,
  answerOpen,
  reportOpen,
  scriptureAudioPhase,
}: SessionActivityState): boolean {
  // Ошибка озвучки остаётся на карточке, но не держит истёкшую молитву:
  // её ничто не завершит, кроме действия пользователя.
  const narrationActive = scriptureAudioPhase === 'loading'
    || scriptureAudioPhase === 'playing'
    || scriptureAudioPhase === 'paused';
  return readerOpen || answerOpen || reportOpen || narrationActive;
}

/** Переход планируется только для свободного экрана молитвы. */
export function scheduleSessionCompletion(
  { timeExpired, screenVisible, activityOpen }: CompletionState,
  onFinish: () => void,
) {
  if (!timeExpired || !screenVisible || activityOpen) return () => {};
  const timeout = setTimeout(onFinish, 1_000);
  return () => clearTimeout(timeout);
}
