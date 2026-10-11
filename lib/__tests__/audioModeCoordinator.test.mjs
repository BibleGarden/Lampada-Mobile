import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAudioModeCoordinator,
  TRANSIENT_AUDIO_PLAYER_OPTIONS,
} from '../audioModeCoordinator.ts';

const playbackMode = { allowsRecording: false, playsInSilentMode: true };
const recordingMode = { allowsRecording: true, playsInSilentMode: true };

test('transient players never schedule global session deactivation on pause', () => {
  assert.equal(TRANSIENT_AUDIO_PLAYER_OPTIONS.keepAudioSessionActive, true);
});

test('recording waits for playback work that was already queued', async () => {
  const coordinator = createAudioModeCoordinator(async () => undefined);
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
  const coordinator = createAudioModeCoordinator(async () => undefined);
  const calls = [];
  const apply = async (mode) => calls.push(mode.allowsRecording);

  const lease = coordinator.acquireRecording(apply, recordingMode);
  const grant = await coordinator.requestPlayback(apply, playbackMode);

  assert.equal(grant, null);
  await lease.ready;
  assert.deepEqual(calls, [true]);
});

test('playback is allowed after the recording lease is released', async () => {
  const coordinator = createAudioModeCoordinator(async () => undefined);
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
  const coordinator = createAudioModeCoordinator(async () => undefined);
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
  const coordinator = createAudioModeCoordinator(async () => undefined);
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
  const coordinator = createAudioModeCoordinator(async () => undefined);
  const lease = coordinator.acquireRecording(async () => {
    throw new Error('mode failed');
  }, recordingMode);

  await assert.rejects(lease.ready, /mode failed/);
  assert.equal(lease.isActive(), false);
  assert.equal(coordinator.hasRecordingLease(), false);
});

test('the last session lease deactivates after recording release', async () => {
  const calls = [];
  const coordinator = createAudioModeCoordinator(async (active) => {
    calls.push(active ? 'active' : 'inactive');
  });
  const music = coordinator.acquireSession();
  const recording = coordinator.acquireSession();
  const modeLease = coordinator.acquireRecording(async () => { calls.push('recording'); }, recordingMode);
  await modeLease.ready;
  await music.release();
  assert.deepEqual(calls, ['recording']);
  modeLease.release();
  await recording.release();
  assert.deepEqual(calls, ['recording', 'inactive']);
  await recording.release();
  assert.deepEqual(calls, ['recording', 'inactive']);
});

test('a new owner cancels a queued deactivation', async () => {
  let deactivations = 0;
  const coordinator = createAudioModeCoordinator(async (active) => { if (!active) deactivations += 1; });
  let unblock;
  const gate = new Promise((resolve) => { unblock = resolve; });
  const oldOwner = coordinator.acquireSession();
  const playback = coordinator.requestPlayback(async () => gate, playbackMode);
  await Promise.resolve();
  const oldRelease = oldOwner.release();
  const nextOwner = coordinator.acquireSession();
  unblock();
  await playback;
  await oldRelease;
  assert.equal(deactivations, 0);
  await nextOwner.release();
  assert.equal(deactivations, 1);
});

test('native deactivation failure is observable to the last owner', async () => {
  const coordinator = createAudioModeCoordinator(async () => { throw new Error('deactivation failed'); });
  const lease = coordinator.acquireSession();
  await assert.rejects(lease.release(), /deactivation failed/);
});

test('playback for a lease holder reactivates a deactivated session before its mode', async () => {
  const calls = [];
  const coordinator = createAudioModeCoordinator(async (active) => {
    calls.push(active ? 'active' : 'inactive');
  });
  const first = coordinator.acquireSession();
  await first.release();
  const narration = coordinator.acquireSession();
  const grant = await coordinator.requestPlayback(async () => { calls.push('mode'); }, playbackMode);
  assert.equal(grant.isCurrent(), true);
  assert.deepEqual(calls, ['inactive', 'active', 'mode']);
  await narration.release();
});

test('restoring the playback mode without a lease keeps an idle session inactive', async () => {
  const calls = [];
  const coordinator = createAudioModeCoordinator(async (active) => {
    calls.push(active ? 'active' : 'inactive');
  });
  await coordinator.requestPlayback(async () => { calls.push('mode'); }, playbackMode);
  assert.deepEqual(calls, ['mode']);
});

test('a failed activation rejects the playback request', async () => {
  const coordinator = createAudioModeCoordinator(async (active) => {
    if (active) throw new Error('activation failed');
  });
  const lease = coordinator.acquireSession();
  let modeApplied = false;
  await assert.rejects(
    coordinator.requestPlayback(async () => { modeApplied = true; }, playbackMode),
    /activation failed/,
  );
  assert.equal(modeApplied, false);
  await lease.release();
});
