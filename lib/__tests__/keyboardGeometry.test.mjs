import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hiddenKeyboard, updateKeyboardState, keyboardLayoutFor, keyboardFormPolicy,
  keyboardSnapTarget, reconcileKeyboardSnap, reservedKeyboardHeight, sheetFooterPosition,
} from '../keyboardGeometry.ts';

const frame = (height, width = 360) => ({ height, width });
const show = (coordinates, settled = true) => ({ type: 'show', coordinates, settled });
const layout = (state, width = 360) => keyboardLayoutFor(state, width);

test('docked keyboards fill inputs and defer screen actions', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(280))));
  assert.equal(k.kind, 'docked');
  assert.deepEqual(keyboardFormPolicy(k), { fillInput: true, actionsVisible: false });
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

test('iOS actions stay deferred through opening and closing animations until didHide', () => {
  let state = updateKeyboardState(hiddenKeyboard, show(frame(280), false));
  assert.equal(layout(state).phase, 'opening');
  state = updateKeyboardState(state, { type: 'willHide' });
  assert.equal(layout(state).phase, 'closing');
  assert.equal(keyboardFormPolicy(layout(state)).actionsVisible, false);
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

const form = (keyboardVisible, extra = {}) => ({ open: true, keyboardVisible, inputFocused: true, recording: false, ...extra });

// Политика и сверка вместе, как их вызывает AnswerSheet на каждую смену
// клавиатуры или фокуса.
const snapStep = (current, keyboardVisible) => reconcileKeyboardSnap(keyboardSnapTarget(current, form(keyboardVisible)));

test('a fast keyboard switch ends with the full-height request whatever the sheet index', () => {
  // Шторка стоит на 100%, клавиатуру меняют: hide и show приходят, пока она едет.
  let step = snapStep(1, false);
  assert.deepEqual(step, { request: 0, target: null });
  step = snapStep(step.target, true);
  assert.deepEqual(step, { request: 1, target: 1 });
  // Повторный show во время анимации повторяет запрос, Gorhom его не выполняет второй раз.
  assert.deepEqual(snapStep(step.target, true), { request: 1, target: 1 });
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
