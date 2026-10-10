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

// Запрос, которым сверяется цель. Gorhom не выполняет повторно запрос точки,
// к которой шторка уже едет, а запрос текущей точки шторку не двигает, поэтому
// цель не сравнивается с индексом шторки: её индекс на JS-потоке отстаёт от
// анимации и мог бы оказаться устаревшим. Запросы выполняются на UI-потоке в
// порядке отправки, поэтому последний из них определяет итог при любом
// порядке событий клавиатуры. Возврат на исходную точку — однократный запрос:
// после него точку снова выбирает человек, в том числе жестом.
export function reconcileKeyboardSnap(target: KeyboardSnap): {
  request: number | null;
  target: KeyboardSnap;
} {
  return { request: target, target: target === 0 ? null : target };
}

// Высота, которую резервирует форма под клавиатурой. Видима ли закреплённая
// клавиатура, решает классификатор React Native (keyboardLayoutFor), а
// Keyboard Controller даёт только кадры анимации. Высоту Keyboard Controller
// после быстрой смены IME может не обновить, поэтому без классификатора она
// оставляла бы фантомный отступ. На Android скрытие видно классификатору уже в
// начале анимации, поэтому, пока анимация идёт, резерв следует за клавиатурой
// вниз. Плавающая клавиатура не занимает полосу окна.
export function reservedKeyboardHeight(kind: KeyboardLayout['kind'], moving: boolean, height: number): number {
  'worklet';
  return kind === 'docked' || (kind === 'hidden' && moving) ? Math.max(0, height) : 0;
}

// Позиция footer шторки (от верха её содержимого) с подъёмом над
// клавиатурой. Клавиатура не отнимает тело целиком: Android снимает фокус с
// поля, чей предок сжался до нуля (View.sizeChange), и набор уходит в никуда.
// Поэтому подъём останавливается на минимальной высоте тела, даже если
// клавиатура выше (полноэкранная IME, низкая snap-точка на маленьком экране).
// Закрывающаяся шторка, которая уже ниже этого минимума, едет вниз вместе с footer.
export function sheetFooterPosition(natural: number, keyboard: number, safeBottom: number, minBody: number): number {
  'worklet';
  const lifted = natural - Math.max(0, keyboard - safeBottom);
  return Math.max(0, lifted, Math.min(natural, minBody));
}
