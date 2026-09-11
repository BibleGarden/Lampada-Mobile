import type { AppStateStatic } from 'react-native';

/** Обновляем календарь, пока Home открыт: при возврате из фона и в полночь. */
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
    // Календарная полночь учитывает сутки длиной 23 или 25 часов при DST.
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
