import { createContext, useContext, useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { AppState } from 'react-native';
import { isVisibleScreen } from './visibleActivity';

export const ScreenUncoveredContext = createContext<boolean | null>(null);

/** A screen is visible only while it is on top of the stack and the app is in the foreground. */
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
