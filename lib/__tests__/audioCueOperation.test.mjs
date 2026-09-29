import assert from 'node:assert/strict';
import test from 'node:test';
import { playCueUntilComplete } from '../audioCueOperation.ts';
import { createPlaybackLeaseOperation } from '../audioPlayerOperation.ts';
import { createAudioModeCoordinator } from '../audioModeCoordinator.ts';

function cuePlayer() {
  let listener;
  let plays = 0;
  let pauses = 0;
  let removals = 0;
  return {
    get plays() { return plays; },
    get pauses() { return pauses; },
    get removals() { return removals; },
    addListener(_event, callback) {
      listener = callback;
      return { remove: () => { removals += 1; listener = undefined; } };
    },
    play() { plays += 1; },
    pause() { pauses += 1; },
    emit(status) { listener?.(status); },
  };
}

test('a completed cue pauses the player and removes its listener', async () => {
  const player = cuePlayer();
  const playback = playCueUntilComplete(player, () => true, 1, 100);
  player.emit({ didJustFinish: true, error: null });
  await playback.promise;
  assert.equal(player.plays, 1);
  assert.equal(player.pauses, 1);
  assert.equal(player.removals, 1);
});

test('cancelling or losing the grant settles without a timeout error', async () => {
  const cancelledPlayer = cuePlayer();
  const cancelled = playCueUntilComplete(cancelledPlayer, () => true, 1, 10);
  cancelled.cancel();
  await cancelled.promise;
  assert.equal(cancelledPlayer.pauses, 0);

  const stalePlayer = cuePlayer();
  let current = true;
  const stale = playCueUntilComplete(stalePlayer, () => current, 1, 10);
  current = false;
  await stale.promise;
  assert.equal(stalePlayer.pauses, 1);
  assert.equal(stalePlayer.removals, 1);
});

test('a real cue timeout rejects after pausing and releasing the listener', async () => {
  const player = cuePlayer();
  const playback = playCueUntilComplete(player, () => true, 1, 5);
  await assert.rejects(playback.promise, /did not finish/);
  assert.equal(player.pauses, 1);
  assert.equal(player.removals, 1);
});

test('unmount cancellation never calls an already released native player', async () => {
  let released = false;
  let pauses = 0;
  let removals = 0;
  let deactivations = 0;
  const coordinator = createAudioModeCoordinator();
  const operation = createPlaybackLeaseOperation();
  const generation = operation.begin(() => coordinator.acquireSession(async () => {
    deactivations += 1;
  }));
  const player = {
    addListener: () => ({ remove: () => { removals += 1; } }),
    play: () => undefined,
    pause: () => {
      pauses += 1;
      if (released) throw new Error('ERR_NATIVE_SHARED_OBJECT_NOT_FOUND');
    },
  };
  const playback = playCueUntilComplete(player, () => operation.isCurrent(generation), 1, 100);
  released = true;
  playback.cancel();
  await Promise.all([playback.promise, operation.cancel()]);
  assert.equal(pauses, 0);
  assert.equal(removals, 1);
  assert.equal(deactivations, 1);
});
