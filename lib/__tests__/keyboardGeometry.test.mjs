import assert from 'node:assert/strict';
import test from 'node:test';
import { keyboardLayoutFor } from '../keyboardGeometry.ts';

test('docked Android and iOS keyboards reserve space above their top edge', () => {
  assert.deepEqual(keyboardLayoutFor({ screenY: 420, height: 280 }), { visible: true, top: 420 });
  assert.deepEqual(keyboardLayoutFor({ screenY: 350, height: 350 }), { visible: true, top: 350 });
});

test('Samsung floating keyboard hides actions without using the window bottom as its edge', () => {
  assert.deepEqual(keyboardLayoutFor({ screenY: 730, height: 0 }), { visible: true, top: null });
});

test('actions stay hidden across docked and floating frames and return only after hide', () => {
  const frames = [
    { screenY: 420, height: 280 },
    { screenY: 730, height: 0 },
    { screenY: 380, height: 320 },
    null,
  ];
  assert.deepEqual(frames.map(keyboardLayoutFor), [
    { visible: true, top: 420 },
    { visible: true, top: null },
    { visible: true, top: 380 },
    { visible: false, top: null },
  ]);
});
