import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hiddenKeyboard, updateKeyboardState, keyboardLayoutFor, keyboardFormPolicy,
  keyboardSnapTarget, reconcileKeyboardSnap,
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

test('a fast keyboard switch converges to the full-height snap after the sheet settles', () => {
  // Шторка стоит на 100%, клавиатуру меняют: hide и show приходят, пока она едет вниз.
  let target = keyboardSnapTarget(1, form(false));
  assert.equal(target, 0);
  let step = reconcileKeyboardSnap(target, 1, false);
  assert.deepEqual(step, { request: 0, target: 0 });
  target = keyboardSnapTarget(step.target, form(true));
  assert.equal(target, 1);
  // Gorhom ещё не сообщил остановку: индекс прежний, повторный запрос не нужен.
  assert.deepEqual(reconcileKeyboardSnap(target, 1, false), { request: null, target: 1 });
  // Шторка доехала до 62% — сверка после остановки поднимает её снова.
  assert.deepEqual(reconcileKeyboardSnap(target, 0, true), { request: 1, target: 1 });
  assert.deepEqual(reconcileKeyboardSnap(1, 1, true), { request: null, target: 1 });
});

test('the resting snap is released only after the sheet settles there', () => {
  // Подъём ещё не дошёл до onChange, а клавиатура уже скрыта.
  assert.deepEqual(reconcileKeyboardSnap(0, 0, false), { request: null, target: 0 });
  // Подъём завершился на 100% — шторку опускают.
  assert.deepEqual(reconcileKeyboardSnap(0, 1, true), { request: 0, target: 0 });
  // Остановка на 62% снимает цель: дальше точку выбирает человек.
  assert.deepEqual(reconcileKeyboardSnap(0, 0, true), { request: null, target: null });
  assert.deepEqual(reconcileKeyboardSnap(null, 1, true), { request: null, target: null });
  assert.equal(keyboardSnapTarget(null, form(false)), null);
});

test('keyboard snap targets follow focus, recording and closing', () => {
  assert.equal(keyboardSnapTarget(null, form(true, { inputFocused: false })), null);
  assert.equal(keyboardSnapTarget(1, form(false, { recording: true })), null);
  assert.equal(keyboardSnapTarget(1, form(true, { open: false })), null);
});
