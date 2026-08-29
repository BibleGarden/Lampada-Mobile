import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjustSessionTimer,
  sessionTimerSnapshot,
} from '../sessionTimer.ts';

test('derives elapsed and remaining time from the wall clock', () => {
  assert.deepEqual(sessionTimerSnapshot(1_000, 11_000, 4_400), {
    elapsed: 3,
    remaining: 7,
  });
});

test('catches up after a background interval and stops at zero', () => {
  assert.deepEqual(sessionTimerSnapshot(1_000, 11_000, 15_000), {
    elapsed: 14,
    remaining: 0,
  });
});

test('keeps an untimed prayer on elapsed wall-clock time', () => {
  assert.deepEqual(sessionTimerSnapshot(5_000, null, 68_999), {
    elapsed: 63,
    remaining: null,
  });
});

test('adjusts the live deadline and preserves the five-second minimum', () => {
  assert.deepEqual(adjustSessionTimer(61_000, 11_000, -60), {
    endsAtMs: 16_000,
    remaining: 5,
    actualDeltaSeconds: -45,
  });
});
