export type KeyboardCoordinates = { screenY: number; height: number; width: number };
export type KeyboardPhase = 'hidden' | 'opening' | 'open' | 'closing';
export type KeyboardState = { coordinates: KeyboardCoordinates | null; phase: KeyboardPhase };
export type KeyboardSignal =
  | { type: 'show'; coordinates: KeyboardCoordinates; settled: boolean }
  | { type: 'frame'; coordinates: KeyboardCoordinates }
  | { type: 'willHide' | 'hide' };

export const hiddenKeyboard: KeyboardState = { coordinates: null, phase: 'hidden' };

export function updateKeyboardState(state: KeyboardState, signal: KeyboardSignal): KeyboardState {
  switch (signal.type) {
    case 'show': return { coordinates: signal.coordinates, phase: signal.settled ? 'open' : 'opening' };
    case 'frame': return state.phase === 'hidden' ? state : { ...state, coordinates: signal.coordinates };
    case 'willHide': return state.phase === 'hidden' ? state : { ...state, phase: 'closing' };
    case 'hide': return hiddenKeyboard;
  }
}

// Плавающая Android-клавиатура видима, но не занимает полосу окна:
// IME inset равен системной панели, а React Native передаёт высоту 0.
// Её screenY — низ окна, а не верх плавающей клавиатуры.
export function keyboardLayoutFor(state: KeyboardState, dockedWidth: number) {
  const { coordinates, phase } = state;
  const visible = phase !== 'hidden';
  // Узкая плавающая клавиатура iPad может сообщать ненулевую высоту.
  // Её прямоугольник не занимает всю нижнюю полосу окна.
  const docked = visible && coordinates !== null && coordinates.height > 0
    && coordinates.width >= dockedWidth - 1;
  return {
    visible,
    phase,
    kind: !visible ? 'hidden' as const : docked ? 'docked' as const : 'floating' as const,
  };
}

export type KeyboardLayout = ReturnType<typeof keyboardLayoutFor>;

export function keyboardFormPolicy(layout: KeyboardLayout, actionMode: 'defer' | 'keep') {
  return {
    fillInput: layout.kind === 'docked',
    actionsVisible: actionMode === 'keep' || !layout.visible,
    dismissVisible: layout.visible,
  };
}
