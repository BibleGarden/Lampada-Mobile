import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { keyboardFormPolicy, type KeyboardLayout } from './keyboardGeometry';

export const KeyboardLayoutContext = createContext<KeyboardLayout | null>(null);
export const ReservedKeyboardHeightContext = createContext<SharedValue<number> | null>(null);

export function useKeyboardLayout() {
  const layout = useContext(KeyboardLayoutContext);
  if (!layout) throw new Error('KeyboardSystemProvider is required for keyboard-aware forms');
  return layout;
}

export function useKeyboardFormPolicy() {
  return keyboardFormPolicy(useKeyboardLayout());
}

// Высота, которую резервируют формы и footer шторки, — на UI-потоке, кадр в
// кадр с анимацией клавиатуры (reservedKeyboardHeight).
export function useReservedKeyboardHeight() {
  const height = useContext(ReservedKeyboardHeightContext);
  if (!height) throw new Error('KeyboardSystemProvider is required for keyboard-aware forms');
  return height;
}
