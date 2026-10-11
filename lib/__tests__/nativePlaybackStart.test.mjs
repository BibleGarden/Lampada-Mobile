import assert from 'node:assert/strict';
import test from 'node:test';

import { watchNativePlaybackStart } from '../nativePlaybackStart.ts';

// Ручные часы: таймеры срабатывают только при advance, поэтому проверка не
// зависит от реального времени.
function clock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    setTimer: (callback, ms) => {
      const id = next++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = until;
    },
    get pending() { return timers.size; },
  };
}

function watch(status, options = {}) {
  const time = clock();
  const failures = [];
  const cancel = watchNativePlaybackStart({
    readStatus: () => status.current,
    onFailed: (reason, live) => failures.push([reason, live.playbackState]),
    timeoutMs: 2_000,
    bufferingLimitMs: 15_000,
    pollMs: 200,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    ...options,
  });
  return { time, failures, cancel };
}

test('a play() the native player ignored is reported once after the start timeout', () => {
  const status = { current: { playing: false, isBuffering: false, playbackState: 'idle' } };
  const { time, failures } = watch(status);
  time.advance(1_800);
  assert.deepEqual(failures, []);
  time.advance(200);
  assert.deepEqual(failures, [['not_started', 'idle']]);
  time.advance(20_000);
  assert.equal(failures.length, 1);
  assert.equal(time.pending, 0);
});

test('a player that starts stops the watch without a failure', () => {
  const status = { current: { playing: false, isBuffering: false } };
  const { time, failures } = watch(status);
  time.advance(400);
  status.current = { playing: true, isBuffering: false };
  time.advance(200);
  assert.equal(time.pending, 0);
  status.current = { playing: false, isBuffering: false };
  time.advance(10_000);
  assert.deepEqual(failures, []);
});

test('a start confirmed by a status event counts even if the live status lags', () => {
  const status = { current: { playing: false, isBuffering: false } };
  let started = false;
  const { time, failures } = watch(status, { hasStarted: () => started });
  started = true;
  time.advance(5_000);
  assert.deepEqual(failures, []);
});

test('buffering extends the wait but not beyond the overall limit', () => {
  const status = { current: { playing: false, isBuffering: true, playbackState: 'buffering' } };
  const { time, failures } = watch(status);
  time.advance(14_800);
  assert.deepEqual(failures, []);
  time.advance(200);
  assert.deepEqual(failures, [['buffering_timeout', 'buffering']]);
});

test('a player that stops buffering without playing fails at once after the start timeout', () => {
  const status = { current: { playing: false, isBuffering: true } };
  const { time, failures } = watch(status);
  time.advance(3_000);
  status.current = { playing: false, isBuffering: false };
  time.advance(200);
  assert.deepEqual(failures, [['not_started', undefined]]);
});

test('cancel clears the pending timer and suppresses the failure', () => {
  const status = { current: { playing: false, isBuffering: false } };
  const { time, failures, cancel } = watch(status);
  time.advance(1_000);
  cancel();
  assert.equal(time.pending, 0);
  time.advance(5_000);
  assert.deepEqual(failures, []);
});
