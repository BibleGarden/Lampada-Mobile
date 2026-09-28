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

test('a hidden finite session schedules one deadline wakeup regardless of music', () => {
  assert.equal(backgroundDeadlineDelay(1_000, 6_000, false), 5_000);
  assert.equal(backgroundDeadlineDelay(7_000, 6_000, false), 0);
  assert.equal(backgroundDeadlineDelay(1_000, null, false), null);
  assert.equal(backgroundDeadlineDelay(7_000, 6_000, true), null);
});
