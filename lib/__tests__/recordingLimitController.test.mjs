import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecordingLimitController } from '../recordingLimitController.ts';

test('the controller stops once when the recorder reports 599 recorded seconds', () => {
  let recordedMillis = 598_999;
  let stops = 0;
  const controller = createRecordingLimitController(
    () => recordedMillis, () => true, () => { stops += 1; },
  );
  assert.equal(controller.poll(), false);
  recordedMillis = 599_000;
  assert.equal(controller.poll(), true);
  assert.equal(controller.poll(), false);
  assert.equal(stops, 1);
});

test('background wall time does not advance the native recorded-time limit', () => {
  let recordedMillis = 120_000;
  let recording = true;
  let stops = 0;
  const controller = createRecordingLimitController(
    () => recordedMillis, () => recording, () => { stops += 1; },
  );
  assert.equal(controller.poll(), false);
  // Во время фоновой паузы тот же нативный счётчик не меняется.
  assert.equal(controller.poll(), false);
  recordedMillis = 598_999;
  assert.equal(controller.poll(), false);
  recording = false;
  recordedMillis = 599_000;
  assert.equal(controller.poll(), false);
  recording = true;
  assert.equal(controller.poll(), true);
  assert.equal(stops, 1);
});

test('reset allows another stop attempt after an unconfirmed native stop', () => {
  let stops = 0;
  const controller = createRecordingLimitController(
    () => 599_000, () => true, () => { stops += 1; },
  );
  controller.poll();
  controller.reset();
  controller.poll();
  assert.equal(stops, 2);
});

test('the scheduled controller polls native time and cancels its interval', () => {
  let recordedMillis = 0;
  let tick;
  let stopped = 0;
  let cancelled;
  const controller = createRecordingLimitController(
    () => recordedMillis, () => true, () => { stopped += 1; },
  );
  const cleanup = controller.startPolling(
    (error) => { throw error; },
    (callback, millis) => { tick = callback; assert.equal(millis, 250); return 7; },
    (timer) => { cancelled = timer; },
  );
  assert.equal(stopped, 0);
  recordedMillis = 599_000;
  tick();
  tick();
  assert.equal(stopped, 1);
  cleanup();
  assert.equal(cancelled, 7);
});

test('a failed native duration read reaches the caller instead of continuing silently', () => {
  const failure = new Error('native status failed');
  const errors = [];
  const controller = createRecordingLimitController(
    () => { throw failure; }, () => true, () => { throw new Error('unexpected stop'); },
  );
  const cleanup = controller.startPolling((error) => errors.push(error), () => 8, () => {});
  cleanup();
  assert.deepEqual(errors, [failure]);
});
