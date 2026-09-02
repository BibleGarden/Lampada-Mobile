import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioModeCoordinator } from '../audioModeCoordinator.ts';

const playbackMode = { allowsRecording: false, playsInSilentMode: true };
const recordingMode = { allowsRecording: true, playsInSilentMode: true };

test('recording waits for playback work that was already queued', async () => {
  const coordinator = createAudioModeCoordinator();
  const calls = [];
  let finishPlayback;
  const playbackGate = new Promise((resolve) => {
    finishPlayback = resolve;
  });
  const apply = async (mode) => {
    calls.push(mode.allowsRecording ? 'recording' : 'playback');
    if (!mode.allowsRecording) await playbackGate;
  };

  const playback = coordinator.requestPlayback(apply, playbackMode);
  // Let the old native playback mode call start before recording is acquired.
  await Promise.resolve();
  assert.deepEqual(calls, ['playback']);
  const lease = coordinator.acquireRecording(apply, recordingMode);

  finishPlayback();
  const staleGrant = await playback;
  await lease.ready;
  assert.deepEqual(calls, ['playback', 'recording']);
  assert.equal(staleGrant.isCurrent(), false);
});

test('recording lease synchronously skips newer playback requests', async () => {
  const coordinator = createAudioModeCoordinator();
  const calls = [];
  const apply = async (mode) => calls.push(mode.allowsRecording);

  const lease = coordinator.acquireRecording(apply, recordingMode);
  const grant = await coordinator.requestPlayback(apply, playbackMode);

  assert.equal(grant, null);
  await lease.ready;
  assert.deepEqual(calls, [true]);
});

test('playback is allowed after the recording lease is released', async () => {
  const coordinator = createAudioModeCoordinator();
  const calls = [];
  const apply = async (mode) => calls.push(mode.allowsRecording);
  const lease = coordinator.acquireRecording(apply, recordingMode);
  await lease.ready;

  assert.equal(lease.release(), true);
  const grant = await coordinator.requestPlayback(apply, playbackMode);
  assert.equal(grant.isCurrent(), true);
  assert.deepEqual(calls, [true, false]);
});

test('lease remains active until its owner explicitly confirms release', async () => {
  const coordinator = createAudioModeCoordinator();
  const apply = async () => undefined;
  const lease = coordinator.acquireRecording(apply, recordingMode);
  await lease.ready;

  // A failed native stop performs no coordinator action.
  assert.equal(coordinator.hasRecordingLease(), true);
  assert.equal(await coordinator.requestPlayback(apply, playbackMode), null);
  assert.equal(lease.release(), true);
  assert.equal(coordinator.hasRecordingLease(), false);
});

test('a recording invalidates a playback continuation after its mode call', async () => {
  const coordinator = createAudioModeCoordinator();
  let finishPlayback;
  const gate = new Promise((resolve) => {
    finishPlayback = resolve;
  });
  const playback = coordinator.requestPlayback(async () => gate, playbackMode);
  await Promise.resolve();

  const lease = coordinator.acquireRecording(async () => undefined, recordingMode);
  finishPlayback();
  const grant = await playback;
  await lease.ready;

  assert.ok(grant);
  assert.equal(grant.isCurrent(), false);
});

test('failed recording-mode acquisition does not retain a lease', async () => {
  const coordinator = createAudioModeCoordinator();
  const lease = coordinator.acquireRecording(async () => {
    throw new Error('mode failed');
  }, recordingMode);

  await assert.rejects(lease.ready, /mode failed/);
  assert.equal(lease.isActive(), false);
  assert.equal(coordinator.hasRecordingLease(), false);
});
