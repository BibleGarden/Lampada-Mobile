import assert from 'node:assert/strict';
import test from 'node:test';
import { hiddenKeyboard, updateKeyboardState, keyboardLayoutFor, keyboardFormPolicy } from '../keyboardGeometry.ts';

const frame = (height, width = 360, screenY = 780 - height) => ({ height, width, screenY });
const show = (coordinates, settled = true) => ({ type: 'show', coordinates, settled });
const layout = (state, width = 360) => keyboardLayoutFor(state, width);

test('docked keyboards fill inputs; screen actions defer, transactional actions remain available', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(280))));
  assert.equal(k.kind, 'docked');
  assert.deepEqual(keyboardFormPolicy(k, 'defer'), { fillInput: true, actionsVisible: false, dismissVisible: true });
  assert.equal(keyboardFormPolicy(k, 'keep').actionsVisible, true);
});

test('Samsung floating zero-height frame is visible and does not expand input', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(0))));
  assert.equal(k.kind, 'floating');
  assert.deepEqual(keyboardFormPolicy(k, 'defer'), { fillInput: false, actionsVisible: false, dismissVisible: true });
});

test('narrow iPad floating frame does not reserve the full window bottom', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(250, 320, 410))), 1024);
  assert.equal(k.kind, 'floating');
  assert.equal(keyboardFormPolicy(k, 'keep').fillInput, false);
});

test('a full-width split keyboard occupies the bottom region', () => {
  assert.equal(layout(updateKeyboardState(hiddenKeyboard, show(frame(320, 1024))), 1024).kind, 'docked');
});

test('docked to floating and back never exposes deferred actions while software keyboard remains visible', () => {
  let state = hiddenKeyboard;
  for (const f of [frame(280), frame(0), frame(310)]) {
    state = updateKeyboardState(state, show(f));
    assert.equal(keyboardFormPolicy(layout(state), 'defer').actionsVisible, false);
  }
  state = updateKeyboardState(state, { type: 'hide' });
  assert.equal(keyboardFormPolicy(layout(state), 'defer').actionsVisible, true);
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
  assert.equal(keyboardFormPolicy(layout(state), 'defer').actionsVisible, false);
  state = updateKeyboardState(state, { type: 'hide' });
  assert.equal(keyboardFormPolicy(layout(state), 'defer').actionsVisible, true);
});

test('hardware focus alone never hides actions or changes the input allocation', () => {
  assert.deepEqual(keyboardFormPolicy(layout(hiddenKeyboard), 'defer'), { fillInput: false, actionsVisible: true, dismissVisible: false });
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

test('dismiss action remains available after native blur until the IME hides', () => {
  const k = layout(updateKeyboardState(hiddenKeyboard, show(frame(0))));
  assert.equal(keyboardFormPolicy(k, 'keep').dismissVisible, true);
  assert.equal(keyboardFormPolicy(layout(hiddenKeyboard), 'keep').dismissVisible, false);
});
