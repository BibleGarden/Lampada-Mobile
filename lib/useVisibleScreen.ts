import { createContext, useContext, useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { AppState } from 'react-native';
import { isVisibleScreen } from './visibleActivity';

export const ScreenUncoveredContext = createContext<boolean | null>(null);

/** Экран виден только пока он наверху стека и приложение на переднем плане. */
export function useVisibleScreen(): boolean {
  const focused = useIsFocused();
  const uncovered = useContext(ScreenUncoveredContext);
  if (uncovered === null) throw new Error('ScreenUncoveredContext is missing');
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state);
    });
    setAppState(AppState.currentState);
    return () => subscription.remove();
  }, []);

  return isVisibleScreen(focused, appState, uncovered);
}
