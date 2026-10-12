import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hiddenKeyboard, updateKeyboardState, keyboardLayoutFor, keyboardFormPolicy,
  keyboardShowing, keyboardSnapTarget, reconcileKeyboardSnap, settledKeyboardSnapRequest, keyboardSnapOnHandleRelease, reservedKeyboardHeight,
  pendingKeyboardReserve,
  naturalFooterPosition, sheetBodyHeight, sheetFooterPosition,
} from '../keyboardGeometry.ts';

const frame = (height, width = 360) => ({ height, width });
const show = (coordinates, settled = true) => ({ type: 'show', coordinates, settled });
const layout = (state, width = 360) => keyboardLayoutFor(state, width);

test('docked keyboards fill inputs and defer screen actions', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(280))));
  assert.equal(k.kind, 'docked');
  assert.deepEqual(keyboardFormPolicy(k), { fillInput: true, actionsVisible: false });
});

test('a closing docked keyboard returns the form and its actions when the hide starts', () => {
  let state = updateKeyboardState(hiddenKeyboard, show(frame(280), false));
  assert.equal(keyboardFormPolicy(layout(state)).fillInput, true);
  // iOS keyboardWillHide: форма вместе с действиями возвращается к обычной раскладке.
  state = updateKeyboardState(state, { type: 'willHide' });
  assert.deepEqual(keyboardFormPolicy(layout(state)), { fillInput: false, actionsVisible: true });
  state = updateKeyboardState(state, { type: 'hide' });
  assert.deepEqual(keyboardFormPolicy(layout(state)), { fillInput: false, actionsVisible: true });
});

test('the pending keyboard strip keeps a filling input at its final height while the keyboard opens', () => {
  const safeBottom = 20;
  // Начало открытия: клавиатура ещё внизу, вся будущая полоса пуста.
  assert.equal(pendingKeyboardReserve(safeBottom, 0, 300), 280);
  // Кадр за кадром полоса уменьшается ровно на столько, на сколько растёт резерв viewport.
  for (const reserved of [10, 120, 299]) {
    assert.equal(pendingKeyboardReserve(safeBottom, reserved, 300) + Math.max(safeBottom, reserved), 300);
  }
  assert.equal(pendingKeyboardReserve(safeBottom, 300, 300), 0);
  // Закрытие и уменьшение клавиатуры полосы не оставляют.
  assert.equal(pendingKeyboardReserve(safeBottom, 200, 0), 0);
  assert.equal(pendingKeyboardReserve(safeBottom, 300, 250), 0);
});

test('Samsung floating zero-height frame is visible and does not expand input', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(0))));
  assert.equal(k.kind, 'floating');
  assert.deepEqual(keyboardFormPolicy(k), { fillInput: false, actionsVisible: false });
});

test('narrow iPad floating frame does not reserve the full window bottom', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(250, 320))), 1024);
  assert.equal(k.kind, 'floating');
  assert.equal(keyboardFormPolicy(k).fillInput, false);
});

test('Android docked keyboard stays docked after a width-only window resize', () => {
  // Раскрытие Fold: окно стало шире, а keyboardDidShow не пришёл повторно.
  const state = updateKeyboardState(hiddenKeyboard, show(frame(280, 427)));
  assert.equal(keyboardLayoutFor(state, null).kind, 'docked');
  assert.equal(keyboardLayoutFor(updateKeyboardState(hiddenKeyboard, show(frame(0, 427))), null).kind, 'floating');
  // Плавающий Gboard: IME inset меньше системной панели, высота отрицательна.
  assert.equal(keyboardLayoutFor(updateKeyboardState(hiddenKeyboard, show(frame(-48, 427))), null).kind, 'floating');
});

test('a full-width split keyboard occupies the bottom region', () => {
  assert.equal(layout(updateKeyboardState(hiddenKeyboard, show(frame(320, 1024))), 1024).kind, 'docked');
});

test('docked to floating and back never exposes deferred actions while software keyboard remains visible', () => {
  let state = hiddenKeyboard;
  for (const f of [frame(280), frame(0), frame(310)]) {
    state = updateKeyboardState(state, show(f));
    assert.equal(keyboardFormPolicy(layout(state)).actionsVisible, false);
  }
  state = updateKeyboardState(state, { type: 'hide' });
  assert.equal(keyboardFormPolicy(layout(state)).actionsVisible, true);
});

test('changing a frame to zero height does not imply dismissal', () => {
  let state = updateKeyboardState(hiddenKeyboard, show(frame(280)));
  state = updateKeyboardState(state, { type: 'frame', coordinates: frame(0) });
  assert.equal(layout(state).visible, true);
  assert.equal(layout(state).kind, 'floating');
});

test('iOS actions stay deferred through the opening animation and return when the hide starts', () => {
  let state = updateKeyboardState(hiddenKeyboard, show(frame(280), false));
  assert.equal(layout(state).phase, 'opening');
  assert.equal(keyboardFormPolicy(layout(state)).actionsVisible, false);
  state = updateKeyboardState(state, { type: 'willHide' });
  assert.equal(layout(state).phase, 'closing');
  assert.equal(keyboardFormPolicy(layout(state)).actionsVisible, true);
  state = updateKeyboardState(state, { type: 'hide' });
  assert.equal(keyboardFormPolicy(layout(state)).actionsVisible, true);
});

test('focus without a software keyboard frame keeps actions and the default input allocation', () => {
  assert.deepEqual(keyboardFormPolicy(layout(hiddenKeyboard)), { fillInput: false, actionsVisible: true });
});

test('the iPad hardware-keyboard shortcut bar is a full-width frame and defers actions', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(55, 1024))), 1024);
  assert.equal(k.kind, 'docked');
  assert.deepEqual(keyboardFormPolicy(k), { fillInput: true, actionsVisible: false });
});

test('frame notifications after hide cannot resurrect stale keyboard state', () => {
  assert.equal(updateKeyboardState(hiddenKeyboard, { type: 'frame', coordinates: frame(280) }), hiddenKeyboard);
});

test('fold and rotation width changes reclassify frames without losing visibility', () => {
  let state = updateKeyboardState(hiddenKeyboard, show(frame(300, 360)));
  assert.equal(layout(state).kind, 'docked');
  assert.equal(layout(state, 720).kind, 'floating');
  state = updateKeyboardState(state, { type: 'frame', coordinates: frame(300, 720) });
  assert.equal(layout(state, 720).kind, 'docked');
  assert.equal(layout(state, 720).visible, true);
});

test('native fractional-pixel width rounding does not misclassify a docked keyboard', () => {
  assert.equal(layout(updateKeyboardState(hiddenKeyboard, show(frame(280, 359.5)))).kind, 'docked');
});

const form = (keyboardShowing, extra = {}) => ({ open: true, keyboardShowing, inputFocused: true, recording: false, ...extra });

// Политика и сверка вместе, как их вызывает AnswerSheet на каждую смену
// клавиатуры или фокуса.
const snapStep = (current, keyboardShowing) => reconcileKeyboardSnap(keyboardSnapTarget(current, form(keyboardShowing)));

test('a fast keyboard switch ends with the full-height request whatever the sheet index', () => {
  // Шторка стоит на 100%, клавиатуру меняют: hide и show приходят, пока она едет.
  let step = snapStep(1, false);
  assert.deepEqual(step, { request: 0, target: null });
  step = snapStep(step.target, true);
  assert.deepEqual(step, { request: 1, target: 1 });
  // Повторный show во время анимации повторяет запрос, Gorhom его не выполняет второй раз.
  assert.deepEqual(snapStep(step.target, true), { request: 1, target: 1 });
});

test('a sheet that stops below full height re-requests it while the keyboard needs it', () => {
  // Запрос 1 отброшен Gorhom из-за ещё не применённого запроса 0: шторка встала на 62%.
  assert.equal(settledKeyboardSnapRequest(1, 0), 1);
  assert.equal(settledKeyboardSnapRequest(1, 1), null);
  // Закрытие, возврат на исходную и выбор человека не трогаются.
  assert.equal(settledKeyboardSnapRequest(1, -1), null);
  assert.equal(settledKeyboardSnapRequest(0, 1), null);
  assert.equal(settledKeyboardSnapRequest(null, 0), null);
});

test('a tap on the handle returns the sheet like any keyboard hide, a drag leaves it to the person', () => {
  // Скрытие клавиатуры пришло, пока ручку держат: возврат ждёт отпускания.
  const pressed = reconcileKeyboardSnap(keyboardSnapTarget(1, form(false)), true);
  assert.deepEqual(pressed, { request: null, target: 0 });
  assert.deepEqual(keyboardSnapOnHandleRelease(pressed.target, false), { request: 0, target: null });
  assert.deepEqual(keyboardSnapOnHandleRelease(pressed.target, true), { request: null, target: null });
  // Перетаскивание при открытой клавиатуре снимает и цель полной высоты.
  assert.deepEqual(keyboardSnapOnHandleRelease(1, true), { request: null, target: null });
  assert.deepEqual(keyboardSnapOnHandleRelease(null, false), { request: null, target: null });
  // Пока ручку держат, полная высота по-прежнему запрашивается сразу.
  assert.deepEqual(reconcileKeyboardSnap(1, true), { request: 1, target: 1 });
});

test('the resting snap is a single request, so a later drag stays where the person put it', () => {
  // Клавиатуру скрыли, пока шторка ещё поднималась: возврат запрашивается один раз.
  assert.deepEqual(snapStep(1, false), { request: 0, target: null });
  // После жеста (в том числе обратно на 62%) клавиатура больше не требует точку.
  assert.deepEqual(snapStep(null, false), { request: null, target: null });
  assert.deepEqual(reconcileKeyboardSnap(null), { request: null, target: null });
});

test('keyboard snap targets follow focus, recording and closing', () => {
  assert.equal(keyboardSnapTarget(null, form(true, { inputFocused: false })), null);
  assert.equal(keyboardSnapTarget(1, form(false, { recording: true })), null);
  assert.equal(keyboardSnapTarget(1, form(true, { open: false })), null);
});

test('the classifier, not Keyboard Controller height, decides the keyboard reservation', () => {
  assert.equal(reservedKeyboardHeight('docked', false, 300), 300);
  assert.equal(reservedKeyboardHeight('docked', true, 120), 120);
  // Фантомная высота после быстрой смены IME: классификатор сказал «скрыта».
  assert.equal(reservedKeyboardHeight('hidden', false, 300), 0);
  // На Android скрытие видно классификатору с начала анимации: резерв едет вниз с клавиатурой.
  assert.equal(reservedKeyboardHeight('hidden', true, 140), 140);
  assert.equal(reservedKeyboardHeight('floating', true, 300), 0);
  assert.equal(reservedKeyboardHeight('floating', false, 300), 0);
  assert.equal(reservedKeyboardHeight('docked', false, -4), 0);
});

test('the sheet footer lifts above the keyboard but keeps a minimum body', () => {
  const minBody = 72;
  // Без клавиатуры и с клавиатурой ниже безопасной зоны footer на своём месте.
  assert.equal(sheetFooterPosition(500, 0, 34, minBody), 500);
  assert.equal(sheetFooterPosition(500, 20, 34, minBody), 500);
  // Частичный подъём: клавиатура за вычетом безопасной зоны.
  assert.equal(sheetFooterPosition(500, 300, 34, minBody), 234);
  // Клавиатура выше шторки: тело не сжимается ниже минимума.
  assert.equal(sheetFooterPosition(300, 400, 34, minBody), minBody);
  // Закрывающаяся шторка уже ниже минимума: footer идёт вниз вместе с ней.
  assert.equal(sheetFooterPosition(40, 300, 34, minBody), 40);
  assert.equal(sheetFooterPosition(-20, 300, 34, minBody), 0);
});

test('a closing keyboard no longer holds the sheet, so it returns together with the keyboard', () => {
  let state = updateKeyboardState(hiddenKeyboard, show(frame(300), false));
  assert.equal(keyboardShowing(layout(state)), true);
  state = updateKeyboardState(state, show(frame(300)));
  assert.equal(keyboardShowing(layout(state)), true);
  // iOS keyboardWillHide: клавиатура ещё видна и резервирует место, но шторка уже опускается.
  state = updateKeyboardState(state, { type: 'willHide' });
  assert.equal(layout(state).visible, true);
  assert.equal(keyboardShowing(layout(state)), false);
  assert.deepEqual(snapStep(1, keyboardShowing(layout(state))), { request: 0, target: null });
  assert.equal(keyboardShowing(layout(updateKeyboardState(state, { type: 'hide' }))), false);
});

test('the sheet body takes its target height when a transition starts', () => {
  const sheet = { containerHeight: 1000, handleHeight: 22, footerHeight: 100 };
  const rest = (position) => ({ position, dragging: false });
  const toward = (position, nextIndex, nextPosition) => ({ position, nextIndex, nextPosition, dragging: false });
  // Стоящая шторка без клавиатуры: тело кончается над footer.
  assert.equal(naturalFooterPosition(sheet, 380), 498);
  assert.equal(sheetBodyHeight(sheet, rest(380), 0, 34, 72), 498);
  // Открытие: сразу высота у точки назначения, а не у текущей позиции.
  assert.equal(sheetBodyHeight(sheet, toward(1000, 0, 380), 0, 34, 72), 498);
  // UI-поток видит keyboard target раньше, чем JS попросит Gorhom snap.
  assert.equal(sheetBodyHeight(sheet, rest(380), 300, 34, 72, 0), 612);
  assert.equal(sheetBodyHeight(sheet, toward(380, 1, 0), 300, 34, 72, 0), 612);
  // Hide target тоже приходит раньше snap-запроса: тело берёт высоту 62% сразу.
  assert.equal(sheetBodyHeight(sheet, rest(0), 0, 34, 72, 0, 300, 0.38), 498);
  assert.equal(sheetBodyHeight(sheet, toward(0, 0, 380), 0, 34, 72, 0, 200, 0.38), 498);
  // Скрытие: тело сразу растёт до итоговой высоты, остаток закрывают footer и клавиатура.
  assert.equal(sheetBodyHeight(sheet, toward(0, 0, 380), 0, 34, 72), 498);
  // Плавающая клавиатура резерва не даёт; клавиатура выше шторки упирается в минимум.
  assert.equal(sheetBodyHeight(sheet, rest(0), 0, 34, 72), 878);
  assert.equal(sheetBodyHeight(sheet, rest(380), 900, 34, 72), 72);
  // Закрытие и жест человека тело не перестраивают.
  assert.equal(sheetBodyHeight(sheet, toward(380, -1, 1000), 0, 34, 72), null);
  assert.equal(sheetBodyHeight(sheet, { position: 300, dragging: true }, 0, 34, 72), null);
  // Gorhom ещё не измерил ручку или footer.
  assert.equal(sheetBodyHeight({ ...sheet, handleHeight: -999 }, rest(380), 0, 34, 72), 0);
  assert.equal(naturalFooterPosition({ ...sheet, footerHeight: -999 }, 380), 0);
});
