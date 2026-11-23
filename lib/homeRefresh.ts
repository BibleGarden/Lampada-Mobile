import type { AppStateStatic } from 'react-native';

/** Refreshes the calendar while Home is open: on return from the background and at midnight. */
export function startHomeRefresh(
  appState: Pick<AppStateStatic, 'currentState' | 'addEventListener'>,
  refresh: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const refreshAndSchedule = () => {
    clearTimeout(timer);
    refresh();
    const now = new Date();
    const midnight = new Date(now);
    // Calendar midnight accounts for 23- or 25-hour days during DST.
    midnight.setHours(24, 0, 0, 0);
    timer = setTimeout(refreshAndSchedule, midnight.getTime() - now.getTime());
  };

  const subscription = appState.addEventListener('change', (state) => {
    if (state === 'active') refreshAndSchedule();
    else clearTimeout(timer);
  });
  if (appState.currentState === 'active') refreshAndSchedule();

  return () => {
    clearTimeout(timer);
    subscription.remove();
  };
}
