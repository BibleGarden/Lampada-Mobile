import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioModeCoordinator } from '../audioModeCoordinator.ts';
import { createJournalPlaybackOperation } from '../journalPlaybackOperation.ts';

function fixture(t, { ignoredPlay = false, modeError = null, replaceError = null, playError = null, modeGate = null } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const changes = [];
  const failures = [];
  const releaseFailures = [];
  const releases = [];
  let removed = false;
  const native = (call) => {
    assert.equal(removed, false, `native ${call} after unmount`);
    calls.push(call);
  };
  const player = {
    currentStatus: { playing: false, isBuffering: false, playbackState: 'ready', didJustFinish: false, error: null },
    replace(uri) {
      native(`replace:${uri}`);
      if (replaceError) throw replaceError;
    },
    play() {
      native('play');
      if (playError) throw playError;
      this.currentStatus = { ...this.currentStatus, playing: !ignoredPlay };
    },
    pause() {
      native('pause');
      this.currentStatus = { ...this.currentStatus, playing: false };
    },
  };
  const coordinator = createAudioModeCoordinator(async (active) => calls.push(active ? 'activate' : 'deactivate'));
  const operation = createJournalPlaybackOperation({
    player,
    acquireSession: () => {
      const lease = coordinator.acquireSession();
      return { release: () => { const released = lease.release(); releases.push(released); return released; } };
    },
    requestPlayback: () => coordinator.requestPlayback(async () => {
      calls.push('mode');
      if (modeError) throw modeError;
      if (modeGate) await modeGate;
    }, { allowsRecording: false, playsInSilentMode: true }),
    onPlayingChange: (uri) => changes.push(uri),
    onFailure: (uri, reason, error) => failures.push({ uri, reason, error }),
    onReleaseFailure: (error) => releaseFailures.push(error),
  });
  t.after(() => operation.dispose());
  return {
    operation, player, calls, changes, failures, releases, releaseFailures,
    flush: () => Promise.all(releases),
    removeNative: () => { removed = true; },
  };
}

test('journal pause releases the lease, clears playback and cancels the start watcher', async (t) => {
  const f = fixture(t);
  await f.operation.start('a.m4a');
  f.operation.stop();
  await f.flush();
  assert.equal(f.releases.length, 1);
  assert.equal(f.changes.at(-1), null);
  assert.equal(f.calls.at(-1), 'deactivate');
  assert.equal(f.calls.filter((call) => call === 'pause').length, 1);
  t.mock.timers.tick(20_000);
  assert.deepEqual(f.failures, []);
});

test('journal native completion releases its lease without another player call', async (t) => {
  const f = fixture(t);
  await f.operation.start('a.m4a');
  const before = f.calls.length;
  f.operation.status({ ...f.player.currentStatus, playing: false, didJustFinish: true });
  await f.flush();
  assert.equal(f.releases.length, 1);
  assert.equal(f.changes.at(-1), null);
  assert.deepEqual(f.calls.slice(before), ['deactivate']);
  t.mock.timers.tick(20_000);
  assert.deepEqual(f.failures, []);
});

test('journal native error stops playback, reports the affected URI and releases once', async (t) => {
  const f = fixture(t);
  await f.operation.start('broken.m4a');
  f.operation.status({ ...f.player.currentStatus, error: 'decoder error' });
  await f.flush();
  assert.equal(f.releases.length, 1);
  assert.equal(f.changes.at(-1), null);
  assert.equal(f.calls.at(-1), 'deactivate');
  assert.deepEqual(f.failures, [{ uri: 'broken.m4a', reason: 'player_error', error: 'decoder error' }]);
  f.operation.status({ ...f.player.currentStatus, error: 'decoder error' });
  assert.equal(f.releases.length, 1);
});

test('an ignored journal play fails at the native start deadline and releases its lease', async (t) => {
  const f = fixture(t, { ignoredPlay: true });
  await f.operation.start('silent.m4a');
  // Отдельные тики отражают рекурсивное планирование watcher.
  for (let tick = 0; tick < 10; tick++) t.mock.timers.tick(200);
  await f.flush();
  assert.equal(f.releases.length, 1);
  assert.equal(f.changes.at(-1), null);
  assert.equal(f.failures[0].reason, 'not_started');
  assert.equal(f.failures[0].uri, 'silent.m4a');
});

test('switching journal rows stops the old source and releases only its lease', async (t) => {
  const f = fixture(t);
  await f.operation.start('first.m4a');
  await f.operation.start('second.m4a');
  await f.flush();
  assert.equal(f.releases.length, 1);
  assert.equal(f.calls.filter((call) => call === 'pause').length, 1);
  assert.equal(f.changes.at(-1), 'second.m4a');
  f.operation.stop();
  await f.flush();
  assert.equal(f.releases.length, 2);
  assert.equal(f.calls.at(-1), 'deactivate');
});

for (const action of ['stop', 'dispose']) {
  test(`journal ${action} during a pending grant releases the lease and prevents late native playback`, async (t) => {
    let resolveMode;
    const modeGate = new Promise((resolve) => { resolveMode = resolve; });
    const f = fixture(t, { modeGate });
    const pending = f.operation.start('pending.m4a');
    if (action === 'dispose') f.removeNative();
    f.operation[action]();
    const before = f.changes.length;
    resolveMode();
    await pending;
    await f.flush();
    assert.equal(f.releases.length, 1);
    assert.equal(f.calls.includes('replace:pending.m4a'), false);
    assert.equal(f.calls.includes('play'), false);
    assert.equal(f.changes.length, before);
    assert.deepEqual(f.failures, []);
  });
}

for (const stage of ['mode', 'replace', 'play']) {
  test(`journal ${stage} failure releases the lease and reports its actual stage`, async (t) => {
    const error = new Error(`${stage} unavailable`);
    const f = fixture(t, { [`${stage}Error`]: error });
    await f.operation.start('broken.m4a');
    await f.flush();
    assert.equal(f.releases.length, 1);
    assert.equal(f.changes.at(-1), null);
    assert.equal(f.failures.length, 1);
    assert.equal(f.failures[0].reason, stage === 'mode' ? 'mode_failed' : 'play_failed');
    assert.equal(f.failures[0].error.cause, error);
  });
}

test('journal unmount releases its lease and cancels all late work without native methods or UI updates', async (t) => {
  const f = fixture(t, { ignoredPlay: true });
  await f.operation.start('a.m4a');
  const before = f.changes.length;
  f.removeNative();
  f.operation.dispose();
  await f.flush();
  t.mock.timers.tick(20_000);
  f.operation.status({ ...f.player.currentStatus, didJustFinish: true });
  await f.operation.start('late.m4a');
  assert.equal(f.releases.length, 1);
  assert.equal(f.changes.length, before);
  assert.deepEqual(f.failures, []);
  assert.deepEqual(f.releaseFailures, []);
});
