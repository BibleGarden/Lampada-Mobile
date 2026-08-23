import assert from 'node:assert/strict';
import test from 'node:test';

import { prayerTrackOrder } from '../musicOrder.ts';

test('возвращает все 15 треков один раз, начиная с выбранной позиции', () => {
  const order = prayerTrackOrder(15, null, () => 0.5);

  assert.equal(order.length, 15);
  assert.equal(order[0], 7);
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i));
});

test('не повторяет старт предыдущей молитвы', () => {
  const first = prayerTrackOrder(15, null, () => 0)[0];
  const second = prayerTrackOrder(15, first, () => 0)[0];

  assert.equal(first, 0);
  assert.equal(second, 1);
});

test('корректно обрабатывает пустой каталог и единственный трек', () => {
  assert.deepEqual(prayerTrackOrder(0, null, () => 0), []);
  assert.deepEqual(prayerTrackOrder(1, 0, () => 0.9), [0]);
});
