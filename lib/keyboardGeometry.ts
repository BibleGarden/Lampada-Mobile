export type KeyboardCoordinates = { height: number; width: number };
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

export function keyboardFormPolicy(layout: KeyboardLayout) {
  return {
    fillInput: layout.kind === 'docked',
    actionsVisible: !layout.visible,
  };
}

// Точка шторки ответа, которую требует клавиатура: 1 — вся высота, 0 —
// вернуть на исходную, null — точку выбирает человек.
export type KeyboardSnap = 0 | 1 | null;

export function keyboardSnapTarget(current: KeyboardSnap, form: {
  open: boolean;
  keyboardVisible: boolean;
  inputFocused: boolean;
  recording: boolean;
}): KeyboardSnap {
  if (!form.open) return null;
  if (form.keyboardVisible && form.inputFocused) return 1;
  if (current === null) return null;
  // После старта записи шторку не опускаем.
  return form.recording ? null : 0;
}

// Сверка цели с точкой, на которой Gorhom остановил шторку. Запрос
// повторяется при каждой сверке, пока точки не совпадут, поэтому итог не
// зависит от порядка событий клавиатуры и анимаций. Цель «вернуть на
// исходную» снимается только по остановке: до неё индекс ещё не знает
// о начатом подъёме.
export function reconcileKeyboardSnap(target: KeyboardSnap, index: number, settled: boolean): {
  request: number | null;
  target: KeyboardSnap;
} {
  if (target === null) return { request: null, target };
  if (index !== target) return { request: target, target };
  return { request: null, target: settled && target === 0 ? null : target };
}
