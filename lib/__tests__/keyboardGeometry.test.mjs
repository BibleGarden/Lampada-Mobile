import assert from 'node:assert/strict';
import test from 'node:test';
import { dockedKeyboardTop } from '../keyboardGeometry.ts';

test('docked Android and iOS keyboards reserve space above their top edge', () => {
  assert.equal(dockedKeyboardTop({ screenY: 420, height: 280 }), 420);
  assert.equal(dockedKeyboardTop({ screenY: 350, height: 350 }), 350);
});

test('Samsung floating keyboard does not turn the bottom of the window into a keyboard edge', () => {
  assert.equal(dockedKeyboardTop({ screenY: 730, height: 0 }), null);
});

test('switching between docked, floating and hidden keyboard frames restores the layout', () => {
  const frames = [
    { screenY: 420, height: 280 },
    { screenY: 730, height: 0 },
    { screenY: 380, height: 320 },
    { screenY: 780, height: 0 },
  ];
  assert.deepEqual(frames.map(dockedKeyboardTop), [420, null, 380, null]);
});
