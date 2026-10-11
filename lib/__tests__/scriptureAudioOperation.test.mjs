import assert from 'node:assert/strict';
import test from 'node:test';

import { createScriptureAudioOperation, narrationNativeState } from '../scriptureAudioOperation.ts';
import { createAudioModeCoordinator } from '../audioModeCoordinator.ts';
import { hasSessionActivity } from '../sessionCompletion.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function beginCachedResume(operation, grant, play) {
  const continuation = operation.begin();
  assert.ok(continuation);
  await grant;
  if (continuation.isCurrent()) play();
}

test('cached Scripture resume does not play after stop', async () => {
  const operation = createScriptureAudioOperation();
  operation.setContext('john-3:received:voice-1');
  const grant = deferred();
  let playCalls = 0;
  const resume = beginCachedResume(operation, grant.promise, () => {
    playCalls += 1;
  });

  operation.invalidate();
  grant.resolve();
  await resume;

  assert.equal(playCalls, 0);
});

test('cached Scripture resume does not play after excerpt changes', async () => {
  const operation = createScriptureAudioOperation();
  operation.setContext('john-3:received:voice-1');
  const grant = deferred();
  let playCalls = 0;
  const resume = beginCachedResume(operation, grant.promise, () => {
    playCalls += 1;
  });

  operation.setContext('psalm-23:received:voice-1');
  grant.resolve();
  await resume;

  assert.equal(playCalls, 0);
});

test('cached Scripture resume does not play after audio is disabled', async () => {
  const operation = createScriptureAudioOperation();
  operation.setContext('john-3:received:voice-1');
  const grant = deferred();
  let playCalls = 0;
  const resume = beginCachedResume(operation, grant.promise, () => {
    playCalls += 1;
  });

  operation.setContext(null);
  grant.resolve();
  await resume;

  assert.equal(playCalls, 0);
});

test('narration waits for the native player to start, including while buffering', () => {
  assert.equal(narrationNativeState({ playing: false, isBuffering: false }, false), 'waiting');
  assert.equal(narrationNativeState({ playing: false, isBuffering: true }, false), 'waiting');
  assert.equal(narrationNativeState({ playing: true, isBuffering: false }, false), 'started');
});

test('a started narration whose native player stopped is reported as stopped', () => {
  assert.equal(narrationNativeState({ playing: true, isBuffering: false }, true), 'started');
  assert.equal(narrationNativeState({ playing: false, isBuffering: true }, true), 'waiting');
  assert.equal(narrationNativeState({ playing: false, isBuffering: false }, true), 'stopped');
});

test('system audio-focus pause keeps the session active for resume without holding prayer expiry', async () => {
  const activity = { readerOpen: false, answerOpen: false, reportOpen: false };
  const activeChanges = [];
  const coordinator = createAudioModeCoordinator(async (active) => activeChanges.push(active));
  const lease = coordinator.acquireSession();
  await coordinator.requestPlayback(async () => undefined, { allowsRecording: false, playsInSilentMode: true });
  assert.equal(narrationNativeState({ playing: false, isBuffering: false }, true), 'stopped');
  assert.equal(hasSessionActivity({ ...activity, scriptureAudioPhase: 'interrupted' }), false);
  assert.deepEqual(activeChanges, [true]);
  // Native focus gain can resume the same player while its lease remains held.
  assert.equal(narrationNativeState({ playing: true, isBuffering: false }, false), 'started');
  await lease.release();
  assert.deepEqual(activeChanges, [true, false]);
});
