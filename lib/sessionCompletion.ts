type CompletionState = {
  timeExpired: boolean;
  appActive: boolean;
  activityOpen: boolean;
};

/** Переход планируется только для свободного экрана молитвы. */
export function scheduleSessionCompletion(
  { timeExpired, appActive, activityOpen }: CompletionState,
  onFinish: () => void,
) {
  if (!timeExpired || !appActive || activityOpen) return () => {};
  const timeout = setTimeout(onFinish, 1_000);
  return () => clearTimeout(timeout);
}
