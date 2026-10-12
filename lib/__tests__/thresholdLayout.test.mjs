import assert from 'node:assert/strict';
import test from 'node:test';
import { THRESHOLD_DENSITIES, fitThresholdDensity } from '../thresholdLayout.ts';

const sc = (v) => v;
const [regular, compact, tight] = THRESHOLD_DENSITIES;
// Заголовок и три пункта без промежутков — 200 pt.
const TEXT = 200;
const GAPS = 3;

// Высоты, которые экран снял бы при плотности `at` в окне, где под шапкой
// `room` pt.
const measured = (room, at) => ({
  mainHeight: room,
  briefHeight: TEXT + GAPS * at.gap,
  gaps: GAPS,
  density: at,
});
const need = ({ padding, gap, button, bottom }) =>
  TEXT + GAPS * gap + 2 * padding + button + bottom;

test('the original layout stays while it fits', () => {
  assert.deepEqual(fitThresholdDensity(measured(need(regular), regular), sc),
    { density: regular, overflow: false });
  assert.deepEqual(fitThresholdDensity(measured(1000, tight), sc),
    { density: regular, overflow: false });
});

test('a shorter window takes the first density that fits', () => {
  assert.deepEqual(fitThresholdDensity(measured(need(regular) - 1, regular), sc),
    { density: compact, overflow: false });
  assert.deepEqual(fitThresholdDensity(measured(need(compact) - 1, regular), sc),
    { density: tight, overflow: false });
  assert.deepEqual(fitThresholdDensity(measured(need(tight), compact), sc),
    { density: tight, overflow: false });
});

test('the brief scrolls only when even the densest layout does not fit', () => {
  assert.deepEqual(fitThresholdDensity(measured(need(tight) - 1, regular), sc),
    { density: tight, overflow: true });
});

test('the choice does not depend on the density it was measured at', () => {
  for (const room of [need(tight) - 1, need(tight), need(compact), need(regular) - 1, need(regular)]) {
    const results = THRESHOLD_DENSITIES.map((at) => fitThresholdDensity(measured(room, at), sc));
    for (const result of results) assert.deepEqual(result, results[0]);
  }
});
