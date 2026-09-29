import assert from 'node:assert/strict';
import test from 'node:test';

import { createUseRecordingLimit } from '../useRecordingLimit.ts';

function hookHarness() {
  const slots = [];
  const effects = new Map();
  let cursor = 0;
  const runtime = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = effects.get(index);
      if (previous && dependencies.every((item, i) => item === previous.dependencies[i])) return;
      previous?.cleanup?.();
      effects.set(index, { dependencies, cleanup: effect() });
    },
  };
  const useRecordingLimit = createUseRecordingLimit(runtime);
  return {
    render(inputs) { cursor = 0; return useRecordingLimit(inputs); },
    unmount() {
      for (const item of [...effects.values()].reverse()) item.cleanup?.();
      effects.clear();
    },
  };
}

test('hook wires start, scheduled poll, limit stop, a second recording, manual stop and unmount', async () => {
  const harness = hookHarness();
  let phase = 'idle';
  let recordedMillis = 0;
  let tick;
  let automaticStops = 0;
  let manualStops = 0;
  let cancelled = 0;
  const reports = [];
  const inputs = () => ({
    recorder: { getStatus: () => ({ durationMillis: recordedMillis }) },
    phase,
    isRecording: () => phase === 'recording',
    stopAtLimit: async () => { automaticStops += 1; phase = 'idle'; return true; },
    stopAfterStatusFailure: async () => true,
    canStopManually: () => true,
    stopManually: async () => {
      manualStops += 1;
      phase = 'idle';
      return { id: 3, uri: 'file:///manual.m4a', durationSec: 5, transcript: null };
    },
    reportFailure: (reason) => reports.push(reason),
    schedule: (callback, millis) => { tick = callback; assert.equal(millis, 250); return 7; },
    cancel: () => { cancelled += 1; },
  });
  const attempt = () => ({ commit: () => { phase = 'recording'; return true; } });

  let limit = harness.render(inputs());
  assert.equal(limit.commitStart(attempt()), true);
  limit = harness.render(inputs());
  recordedMillis = 598_999;
  tick();
  assert.equal(automaticStops, 0);
  recordedMillis = 599_000;
  tick();
  await Promise.resolve();
  limit = harness.render(inputs());
  assert.equal(automaticStops, 1);
  assert.equal(limit.overlayProps.limitReached, true);
  assert.equal(limit.overlayProps.limitError, null);

  recordedMillis = 0;
  assert.equal(limit.commitStart(attempt()), true);
  limit = harness.render(inputs());
  assert.equal(limit.overlayProps.limitReached, false);
  recordedMillis = 599_000;
  tick();
  await Promise.resolve();
  limit = harness.render(inputs());
  assert.equal(automaticStops, 2);
  assert.equal(limit.overlayProps.limitReached, true);

  recordedMillis = 0;
  limit.commitStart(attempt());
  limit = harness.render(inputs());
  const previousTick = tick;
  limit.overlayProps.onStopRecording();
  await Promise.resolve();
  previousTick();
  assert.equal(manualStops, 1);
  assert.equal(automaticStops, 2);
  harness.render(inputs());
  harness.unmount();
  previousTick();
  assert.equal(automaticStops, 2);
  assert.ok(cancelled >= 3);
  assert.deepEqual(reports, []);
});

test('a persistent native stop failure produces one visible error without retrying', async () => {
  const harness = hookHarness();
  let phase = 'idle';
  let tick;
  let stops = 0;
  const reports = [];
  const inputs = () => ({
    recorder: { getStatus: () => ({ durationMillis: 599_000 }) },
    phase,
    isRecording: () => phase === 'recording',
    stopAtLimit: async () => { stops += 1; return false; },
    stopAfterStatusFailure: async () => true,
    canStopManually: () => true,
    stopManually: async () => null,
    reportFailure: (reason) => reports.push(reason),
    schedule: (callback) => { tick = callback; return 9; },
    cancel: () => {},
  });
  let limit = harness.render(inputs());
  limit.commitStart({ commit: () => { phase = 'recording'; return true; } });
  limit = harness.render(inputs());
  await Promise.resolve();
  limit = harness.render(inputs());
  tick?.();
  tick?.();
  assert.equal(stops, 1);
  assert.equal(limit.overlayProps.limitError, 'components.answers.limitStopFailed');
  assert.equal(limit.overlayProps.limitReached, true);
  assert.deepEqual(reports, ['stop']);
  harness.unmount();
});

test('a persistent native status failure stops once and reports its cause', async () => {
  const harness = hookHarness();
  let phase = 'idle';
  let stopAttempts = 0;
  const failure = new Error('recorder status unavailable');
  const reports = [];
  const inputs = () => ({
    recorder: { getStatus: () => { throw failure; } },
    phase,
    isRecording: () => phase === 'recording',
    stopAtLimit: async () => { throw new Error('unexpected limit stop'); },
    stopAfterStatusFailure: async () => { stopAttempts += 1; return false; },
    canStopManually: () => true,
    stopManually: async () => null,
    reportFailure: (reason, error) => reports.push([reason, error]),
    schedule: () => 10,
    cancel: () => {},
  });
  let limit = harness.render(inputs());
  limit.commitStart({ commit: () => { phase = 'recording'; return true; } });
  limit = harness.render(inputs());
  await Promise.resolve();
  limit = harness.render(inputs());
  assert.equal(stopAttempts, 1);
  assert.equal(limit.overlayProps.limitError, 'components.answers.limitStopFailed');
  assert.deepEqual(reports, [['status', failure], ['stop', undefined]]);
  harness.unmount();
});

test('an ignored early stop tap leaves the limit active and shows no error', async () => {
  const harness = hookHarness();
  let phase = 'idle';
  let recordedMillis = 0;
  let tick;
  let automaticStops = 0;
  let manualAttempts = 0;
  const reports = [];
  const inputs = () => ({
    recorder: { getStatus: () => ({ durationMillis: recordedMillis }) },
    phase,
    isRecording: () => phase === 'recording',
    stopAtLimit: async () => { automaticStops += 1; phase = 'idle'; return true; },
    stopAfterStatusFailure: async () => true,
    canStopManually: () => false,
    stopManually: async () => { manualAttempts += 1; return null; },
    reportFailure: (reason) => reports.push(reason),
    schedule: (callback) => { tick = callback; return 12; },
    cancel: () => {},
  });
  let limit = harness.render(inputs());
  limit.commitStart({ commit: () => { phase = 'recording'; return true; } });
  limit = harness.render(inputs());
  assert.equal(await limit.manualStop(), null);
  limit = harness.render(inputs());
  assert.equal(limit.overlayProps.limitError, null);
  assert.equal(manualAttempts, 0);
  assert.deepEqual(reports, []);
  recordedMillis = 599_000;
  tick();
  await Promise.resolve();
  assert.equal(automaticStops, 1);
  harness.unmount();
});

test('a failed attempted manual stop reports its error but keeps the duration limit active', async () => {
  const harness = hookHarness();
  let phase = 'idle';
  let recordedMillis = 0;
  let tick;
  let automaticStops = 0;
  const reports = [];
  const inputs = () => ({
    recorder: { getStatus: () => ({ durationMillis: recordedMillis }) },
    phase,
    isRecording: () => phase === 'recording',
    stopAtLimit: async () => { automaticStops += 1; phase = 'idle'; return true; },
    stopAfterStatusFailure: async () => true,
    canStopManually: () => true,
    stopManually: async () => null,
    reportFailure: (reason) => reports.push(reason),
    schedule: (callback) => { tick = callback; return 14; },
    cancel: () => {},
  });
  let limit = harness.render(inputs());
  limit.commitStart({ commit: () => { phase = 'recording'; return true; } });
  limit = harness.render(inputs());
  assert.equal(await limit.manualStop(), null);
  limit = harness.render(inputs());
  assert.equal(limit.overlayProps.limitError, 'components.answers.limitStopFailed');
  assert.deepEqual(reports, ['stop']);
  recordedMillis = 599_000;
  tick();
  await Promise.resolve();
  assert.equal(automaticStops, 1);
  harness.unmount();
});

test('unmount disposes an active controller before a stale interval can stop recording', () => {
  const harness = hookHarness();
  let phase = 'idle';
  let recordedMillis = 0;
  let tick;
  let automaticStops = 0;
  const inputs = () => ({
    recorder: { getStatus: () => ({ durationMillis: recordedMillis }) },
    phase,
    isRecording: () => phase === 'recording',
    stopAtLimit: async () => { automaticStops += 1; return true; },
    stopAfterStatusFailure: async () => true,
    canStopManually: () => true,
    stopManually: async () => null,
    reportFailure: (reason) => { throw new Error('unexpected ' + reason); },
    schedule: (callback) => { tick = callback; return 13; },
    cancel: () => {},
  });
  const limit = harness.render(inputs());
  limit.commitStart({ commit: () => { phase = 'recording'; return true; } });
  harness.render(inputs());
  harness.unmount();
  recordedMillis = 599_000;
  tick();
  assert.equal(automaticStops, 0);
});
