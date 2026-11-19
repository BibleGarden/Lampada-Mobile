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
  // A narration error stays on the card but does not hold an expired prayer:
  // nothing except a user action will complete it.
  const narrationActive = scriptureAudioPhase === 'loading'
    || scriptureAudioPhase === 'playing'
    || scriptureAudioPhase === 'paused';
  return readerOpen || answerOpen || reportOpen || narrationActive;
}

/** Completion is scheduled only when the prayer screen is free. */
export function scheduleSessionCompletion(
  { timeExpired, screenVisible, activityOpen }: CompletionState,
  onFinish: () => void,
) {
  if (!timeExpired || !screenVisible || activityOpen) return () => {};
  const timeout = setTimeout(onFinish, 1_000);
  return () => clearTimeout(timeout);
}
