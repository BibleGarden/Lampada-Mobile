import assert from 'node:assert/strict';
import test from 'node:test';

import { prayerTrackOrder } from '../musicOrder.ts';

test('returns all 15 tracks exactly once starting at the selected position', () => {
  const order = prayerTrackOrder(15, null, () => 0.5);

  assert.equal(order.length, 15);
  assert.equal(order[0], 7);
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i));
});

test('does not repeat the starting track of the previous prayer', () => {
  const first = prayerTrackOrder(15, null, () => 0)[0];
  const second = prayerTrackOrder(15, first, () => 0)[0];

  assert.equal(first, 0);
  assert.equal(second, 1);
});

test('handles an empty catalog and a single track', () => {
  assert.deepEqual(prayerTrackOrder(0, null, () => 0), []);
  assert.deepEqual(prayerTrackOrder(1, 0, () => 0.9), [0]);
});
