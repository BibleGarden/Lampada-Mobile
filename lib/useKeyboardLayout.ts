import { createContext, useContext } from 'react';
import { keyboardFormPolicy, type KeyboardLayout } from './keyboardGeometry';

export const KeyboardLayoutContext = createContext<KeyboardLayout | null>(null);

export function useKeyboardLayout() {
  const layout = useContext(KeyboardLayoutContext);
  if (!layout) throw new Error('KeyboardSystemProvider is required for keyboard-aware forms');
  return layout;
}

export function useKeyboardFormPolicy() {
  return keyboardFormPolicy(useKeyboardLayout());
}
