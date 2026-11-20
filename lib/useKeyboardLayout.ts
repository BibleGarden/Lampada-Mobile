import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { keyboardFormPolicy, type KeyboardLayout } from './keyboardGeometry';

export const KeyboardLayoutContext = createContext<KeyboardLayout | null>(null);
// Keyboard frames on the UI thread: the current reserve for it
// (reservedKeyboardHeight) and the reserve its animation is heading to (target).
export type KeyboardFrames = { reserved: SharedValue<number>; target: SharedValue<number> };
export const KeyboardFramesContext = createContext<KeyboardFrames | null>(null);

export function useKeyboardLayout() {
  const layout = useContext(KeyboardLayoutContext);
  if (!layout) throw new Error('KeyboardSystemProvider is required for keyboard-aware forms');
  return layout;
}

export function useKeyboardFormPolicy() {
  return keyboardFormPolicy(useKeyboardLayout());
}

// The reserve held by forms and the sheet footer, frame by frame with the
// keyboard animation, and the reserve that animation will end at.
export function useKeyboardFrames() {
  const frames = useContext(KeyboardFramesContext);
  if (!frames) throw new Error('KeyboardSystemProvider is required for keyboard-aware forms');
  return frames;
}
