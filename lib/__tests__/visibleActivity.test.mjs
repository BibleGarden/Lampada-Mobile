import assert from 'node:assert/strict';
import test from 'node:test';
import { backgroundDeadlineDelay, isVisibleScreen } from '../visibleActivity.ts';

test('visual work needs both navigation focus and an active app', () => {
  assert.equal(isVisibleScreen(true, 'active', true), true);
  for (const state of ['inactive', 'background', null]) {
    assert.equal(isVisibleScreen(true, state, true), false);
  }
  assert.equal(isVisibleScreen(false, 'active', true), false);
  assert.equal(isVisibleScreen(true, 'active', false), false);
});

test('background music schedules one deadline wakeup, not a repeating UI tick', () => {
  assert.equal(backgroundDeadlineDelay(1_000, 6_000, true, false), 5_000);
  assert.equal(backgroundDeadlineDelay(7_000, 6_000, true, false), 0);
  assert.equal(backgroundDeadlineDelay(1_000, 6_000, false, false), null);
  assert.equal(backgroundDeadlineDelay(1_000, null, true, false), null);
  assert.equal(backgroundDeadlineDelay(7_000, 6_000, true, true), null);
});
