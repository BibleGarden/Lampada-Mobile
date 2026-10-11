import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { keyboardFormPolicy, type KeyboardLayout } from './keyboardGeometry';

export const KeyboardLayoutContext = createContext<KeyboardLayout | null>(null);
// Кадры клавиатуры на UI-потоке: резерв под неё сейчас (reservedKeyboardHeight)
// и резерв, к которому идёт её анимация (target).
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

// Резерв, который держат формы и footer шторки, кадр в кадр с анимацией
// клавиатуры, и резерв, которым эта анимация кончится.
export function useKeyboardFrames() {
  const frames = useContext(KeyboardFramesContext);
  if (!frames) throw new Error('KeyboardSystemProvider is required for keyboard-aware forms');
  return frames;
}
