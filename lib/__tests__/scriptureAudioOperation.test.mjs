import assert from 'node:assert/strict';
import test from 'node:test';

import { createScriptureAudioOperation, narrationActiveVerse, narrationInterruptionTransition, narrationNativeState } from '../scriptureAudioOperation.ts';
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

test('a confirmed system pause retains the lease but lets prayer expiry finish; native focus gain resumes it', () => {
  const activity = { readerOpen: false, answerOpen: false, reportOpen: false };
  const paused = { playing: false, isBuffering: false };
  const interrupted = narrationInterruptionTransition('playing', {
    type: 'status', status: paused, liveStatus: paused, started: true,
  });
  assert.deepEqual(interrupted, { phase: 'interrupted', session: 'retain', audioBusy: true });
  assert.equal(hasSessionActivity({ ...activity, scriptureAudioPhase: interrupted.phase }), false);
  const playing = { playing: true, isBuffering: false };
  const resumed = narrationInterruptionTransition(interrupted.phase, {
    type: 'status', status: playing, liveStatus: playing, started: false,
  });
  assert.deepEqual(resumed, { phase: 'playing', session: 'retain', audioBusy: true });
  assert.equal(hasSessionActivity({ ...activity, scriptureAudioPhase: resumed.phase }), true);
});

test('a loading, buffering or stale stopped status cannot interrupt narration', () => {
  const paused = { playing: false, isBuffering: false };
  const playing = { playing: true, isBuffering: false };
  for (const event of [
    { status: paused, liveStatus: paused, started: false },
    { status: { ...paused, isBuffering: true }, liveStatus: paused, started: true },
    { status: paused, liveStatus: playing, started: true },
  ]) {
    assert.equal(narrationInterruptionTransition('playing', { type: 'status', ...event }), null);
  }
  assert.equal(narrationInterruptionTransition('interrupted', {
    type: 'status', status: paused, liveStatus: paused, started: false,
  }), null);
  assert.equal(narrationInterruptionTransition('interrupted', {
    type: 'status', status: playing, liveStatus: paused, started: false,
  }), null);
});

test('manual resume and a stale grant retain an interrupted lease, while a user-paused resume acquires its own', () => {
  assert.deepEqual(narrationInterruptionTransition('interrupted', { type: 'resume_requested' }), {
    phase: 'loading', session: 'retain', audioBusy: true,
  });
  assert.deepEqual(narrationInterruptionTransition('interrupted', { type: 'resume_denied' }), {
    phase: 'interrupted', session: 'retain', audioBusy: true,
  });
  assert.deepEqual(narrationInterruptionTransition('paused', { type: 'resume_requested' }), {
    phase: 'loading', session: 'acquire', audioBusy: true,
  });
  assert.deepEqual(narrationInterruptionTransition('paused', { type: 'resume_denied' }), {
    phase: 'paused', session: 'release', audioBusy: false,
  });
});

test('system interruption preserves the current verse and the same midpoint switch as playback', () => {
  const verses = [
    { number: 3, startSeconds: 10, endSeconds: 14 },
    { number: 4, startSeconds: 16, endSeconds: 20 },
  ];
  for (const phase of ['playing', 'paused', 'interrupted']) {
    assert.equal(narrationActiveVerse(phase, verses, 14.9), 3);
    assert.equal(narrationActiveVerse(phase, verses, 15), 4);
  }
  assert.equal(narrationActiveVerse('idle', verses, 15), null);
  assert.equal(narrationActiveVerse('error', verses, 15), null);
  assert.equal(narrationActiveVerse('interrupted', [], 15), null);
});
