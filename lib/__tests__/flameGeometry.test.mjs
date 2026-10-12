import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAME_HEIGHT_RATIO, fitFlameWidth } from '../flameGeometry.ts';

test('the flame keeps its full size while the block has room for it', () => {
  assert.equal(fitFlameWidth(240, 240 * FLAME_HEIGHT_RATIO), 240);
  assert.equal(fitFlameWidth(240, 1000), 240);
});

test('on a short window the flame shrinks to fit the free height', () => {
  const width = fitFlameWidth(398, 380);
  assert.ok(width < 398);
  assert.ok(width * FLAME_HEIGHT_RATIO <= 380);
  assert.ok((width + 0.5) * FLAME_HEIGHT_RATIO > 380);
});

test('the fitted width snaps to half a point', () => {
  assert.equal(fitFlameWidth(400, 300) % 0.5, 0);
});

test('no free height leaves no room for the flame', () => {
  assert.equal(fitFlameWidth(240, 0), 0);
  assert.equal(fitFlameWidth(240, -20), 0);
});
