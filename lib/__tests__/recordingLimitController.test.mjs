import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecordingLimitController } from '../recordingLimitController.ts';

test('recorded milliseconds trigger one stop at 599 seconds', async () => {
  let recordedMillis = 598_999;
  let stops = 0;
  const failures = [];
  const controller = createRecordingLimitController(
    () => recordedMillis,
    () => true,
    async () => { stops += 1; return true; },
    (reason) => failures.push(reason),
  );
  assert.equal(controller.poll(), false);
  recordedMillis = 599_000;
  assert.equal(controller.poll(), true);
  assert.equal(controller.poll(), false);
  await Promise.resolve();
  assert.equal(stops, 1);
  assert.deepEqual(failures, []);
});

test('background wall time does not advance the native recorded-time limit', () => {
  let recordedMillis = 120_000;
  let recording = true;
  let stops = 0;
  const controller = createRecordingLimitController(
    () => recordedMillis,
    () => recording,
    async () => { stops += 1; return true; },
    (reason) => { throw new Error('unexpected ' + reason); },
  );
  assert.equal(controller.poll(), false);
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

test('polling uses one interval and stops scheduling after the limit', () => {
  let recordedMillis = 0;
  let tick;
  let cancelled;
  let stops = 0;
  const controller = createRecordingLimitController(
    () => recordedMillis,
    () => true,
    async () => { stops += 1; return true; },
    (reason) => { throw new Error('unexpected ' + reason); },
  );
  const cleanup = controller.startPolling(
    (callback, millis) => { tick = callback; assert.equal(millis, 250); return 7; },
    (timer) => { cancelled = timer; },
  );
  recordedMillis = 599_000;
  tick();
  tick();
  assert.equal(stops, 1);
  cleanup();
  assert.equal(cancelled, 7);
});

test('a persistent stop failure becomes terminal until a new recording', async () => {
  let stops = 0;
  const failures = [];
  const controller = createRecordingLimitController(
    () => 599_000,
    () => true,
    async () => { stops += 1; return false; },
    (reason) => failures.push(reason),
  );
  assert.equal(controller.poll(), true);
  await Promise.resolve();
  assert.equal(controller.getState(), 'failed');
  controller.poll();
  controller.poll();
  assert.equal(stops, 1);
  assert.deepEqual(failures, ['stop']);
  controller.reset();
  controller.poll();
  assert.equal(stops, 2);
});

test('a persistent status failure is reported once and halts polling', () => {
  const failure = new Error('native status failed');
  const failures = [];
  let reads = 0;
  const controller = createRecordingLimitController(
    () => { reads += 1; throw failure; },
    () => true,
    async () => { throw new Error('unexpected stop'); },
    (reason, error) => failures.push([reason, error]),
  );
  controller.startPolling(() => 8, () => {});
  controller.poll();
  assert.equal(reads, 1);
  assert.equal(controller.getState(), 'failed');
  assert.deepEqual(failures, [['status', failure]]);
});

test('manual stop and unmount block late automatic work', () => {
  let stops = 0;
  const controller = createRecordingLimitController(
    () => 599_000,
    () => true,
    async () => { stops += 1; return true; },
    (reason) => { throw new Error('unexpected ' + reason); },
  );
  controller.suspend();
  assert.equal(controller.poll(), false);
  controller.dispose();
  assert.equal(controller.poll(), false);
  assert.equal(stops, 0);
});
