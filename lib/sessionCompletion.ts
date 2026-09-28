type CompletionState = {
  timeExpired: boolean;
  screenVisible: boolean;
  activityOpen: boolean;
};

type SessionActivityState = {
  readerOpen: boolean;
  answerOpen: boolean;
  reportOpen: boolean;
  scriptureAudioActive: boolean;
};

export function hasSessionActivity({
  readerOpen,
  answerOpen,
  reportOpen,
  scriptureAudioActive,
}: SessionActivityState): boolean {
  return readerOpen || answerOpen || reportOpen || scriptureAudioActive;
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
