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
// IME inset не больше системной панели, и React Native передаёт высоту ≤ 0.
// Узкая плавающая клавиатура iPad может сообщать ненулевую высоту, поэтому на
// iOS её ширина сравнивается с шириной закреплённой клавиатуры (dockedWidth).
// На Android ширину не сравнивают (null): React Native передаёт там ширину
// видимого окна, а не IME. Она ничего не говорит о плавающей клавиатуре и
// устаревает после изменения только ширины окна (раскрытие Fold, split
// screen), потому что keyboardDidShow тогда не повторяется.
export function keyboardLayoutFor(state: KeyboardState, dockedWidth: number | null) {
  const { coordinates, phase } = state;
  const visible = phase !== 'hidden';
  const docked = visible && coordinates !== null && coordinates.height > 0
    && (dockedWidth === null || coordinates.width >= dockedWidth - 1);
  return {
    visible,
    phase,
    kind: !visible ? 'hidden' as const : docked ? 'docked' as const : 'floating' as const,
  };
}

export type KeyboardLayout = ReturnType<typeof keyboardLayoutFor>;

// Поле заполняет форму, пока закреплённая клавиатура открывается или открыта.
// Закрывающаяся клавиатура раскладку редактирования уже не держит: в начале
// скрытия форма целиком, с отложенными действиями, возвращается к обычной
// раскладке, а не растягивает поле на освобождающееся место и не перестраивается
// второй раз после keyboardDidHide. Резерв viewport идёт вниз с клавиатурой,
// поэтому действия едут над ней. Потеря фокуса или нулевая высота клавиатуры
// действий не возвращают: решает только фаза клавиатуры.
export function keyboardFormPolicy(layout: KeyboardLayout) {
  const showing = keyboardShowing(layout);
  return {
    fillInput: layout.kind === 'docked' && showing,
    actionsVisible: !showing,
  };
}

// Клавиатура нужна форме и шторке, пока она открывается или открыта.
// Закрывающаяся (iOS keyboardWillHide) уже не нужна: шторка возвращается на
// исходную точку вместе с ней, а не отдельным движением после keyboardDidHide.
// Android сообщает скрытие в начале анимации, поэтому там фазы closing нет.
export function keyboardShowing(layout: KeyboardLayout) {
  return layout.phase === 'opening' || layout.phase === 'open';
}

// Точка шторки ответа, которую требует клавиатура: 1 — вся высота, 0 —
// вернуть на исходную, null — точку выбирает человек.
export type KeyboardSnap = 0 | 1 | null;

export function keyboardSnapTarget(current: KeyboardSnap, form: {
  open: boolean;
  keyboardShowing: boolean;
  inputFocused: boolean;
  recording: boolean;
}): KeyboardSnap {
  if (!form.open) return null;
  if (form.keyboardShowing && form.inputFocused) return 1;
  if (current === null) return null;
  // После старта записи шторку не опускаем.
  return form.recording ? null : 0;
}

// Запрос, которым сверяется цель при смене клавиатуры или фокуса. Цель не
// сравнивается с индексом шторки: на JS-потоке он отстаёт от анимации. Возврат
// на исходную точку — однократный запрос: после него точку снова выбирает
// человек, в том числе жестом. Пока человек держит ручку, возврат ждёт
// отпускания (keyboardSnapOnHandleRelease).
export function reconcileKeyboardSnap(target: KeyboardSnap, handlePressed = false): {
  request: number | null;
  target: KeyboardSnap;
} {
  if (target === 0 && handlePressed) return { request: null, target };
  return { request: target, target: target === 0 ? null : target };
}

// Касание ручки скрывает клавиатуру. Простое касание ведёт себя как любое
// скрытие — шторка возвращается на исходную точку; перетаскивание оставляет
// точку человеку, и запрос клавиатуры не спорит с его жестом.
export function keyboardSnapOnHandleRelease(target: KeyboardSnap, dragged: boolean): {
  request: number | null;
  target: KeyboardSnap;
} {
  return dragged ? { request: null, target: null } : reconcileKeyboardSnap(target);
}

// Повторный запрос полной высоты, когда шторка остановилась ниже неё.
// Gorhom отбрасывает запрос точки, к которой идёт текущая анимация, даже если
// более ранний запрос, ещё не дошедший до UI-потока, эту точку меняет. Поэтому
// при быстрой смене IME запрос полной высоты может потеряться, и цель
// проверяется снова при каждой остановке шторки — в том числе на прежней
// точке, о которой Gorhom не сообщает ни onChange, ни onAnimate.
export function settledKeyboardSnapRequest(target: KeyboardSnap, index: number): number | null {
  return target === 1 && index >= 0 && index !== 1 ? 1 : null;
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

// Полоса, которую открывающаяся клавиатура ещё займёт в KeyboardViewport:
// резерв, которым кончится анимация, за вычетом резерва сейчас (оба не меньше
// безопасной зоны). Поле, заполняющее форму над закреплённой клавиатурой,
// стоит над этой полосой и поэтому с первого кадра имеет итоговую высоту:
// клавиатура поднимается в пустую полосу, а не сжимает многострочное поле
// кадр за кадром. Закрывающаяся клавиатура полосы не оставляет — цель ниже.
export function pendingKeyboardReserve(safeBottom: number, reserved: number, target: number): number {
  'worklet';
  return Math.max(0, Math.max(safeBottom, target) - Math.max(safeBottom, reserved));
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

// Высота тела шторки над footer. Footer движется трансформацией кадр в кадр,
// а высота тела — раскладка всего содержимого с многострочным полем, поэтому
// она меняется один раз в начале каждого перехода: тело сразу берёт высоту,
// которая будет над footer, когда шторка и клавиатура дойдут до цели. Пока
// footer едет к ней, он скользит к уже готовому полю или закрывает фоном шторки
// ту часть тела, которую ещё не открыл; в конце перехода ничего не меняется.
// Пока Gorhom не измерил ручку и footer (отрицательные размеры), тела ещё нет.
export type SheetLayout = { containerHeight: number; handleHeight: number; footerHeight: number };

// Позиция footer, которую Gorhom ставит шторке на позиции position
// (BottomSheetFooterContainer), — без подъёма над клавиатурой.
export function naturalFooterPosition(layout: SheetLayout, position: number): number {
  'worklet';
  const { containerHeight, handleHeight, footerHeight } = layout;
  if (handleHeight < 0 || footerHeight < 0) return 0;
  return Math.max(0, containerHeight - position) - footerHeight - handleHeight;
}

// Цель шторки — позиция, к которой идёт её анимация (nextPosition Gorhom), а
// стоящей — текущая. Закрытие и жест человека тело не перестраивают (null):
// закрывающаяся шторка уезжает с содержимым, а цель жеста станет известна,
// когда после отпускания Gorhom запустит анимацию к точке.
export type SheetMotion = { position: number; nextIndex?: number; nextPosition?: number; dragging: boolean };

export function sheetBodyHeight(
  layout: SheetLayout, sheet: SheetMotion, keyboardTarget: number, safeBottom: number, minBody: number,
  keyboardSnapPosition?: number,
  keyboardReserved = 0,
  keyboardRestFraction?: number,
): number | null {
  'worklet';
  if (sheet.dragging || sheet.nextIndex === -1) return null;
  // Keyboard Controller's UI-thread target precedes Gorhom's JS snap request.
  // Use the pending keyboard snap now so the field does not shrink at rest.
  let target = sheet.nextPosition ?? sheet.position;
  if (keyboardTarget > 0 && keyboardSnapPosition !== undefined) {
    target = keyboardSnapPosition;
  } else if (keyboardTarget === 0 && keyboardReserved > 0 && keyboardRestFraction !== undefined) {
    target = layout.containerHeight * keyboardRestFraction;
  }
  return sheetFooterPosition(naturalFooterPosition(layout, target), keyboardTarget, safeBottom, minBody);
}
