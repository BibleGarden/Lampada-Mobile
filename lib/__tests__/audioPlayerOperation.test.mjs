import assert from 'node:assert/strict';
import test from 'node:test';

import { playAudioRecording, waitForAudioPlayerReady } from '../audioPlayerOperation.ts';

test('waits for a replaced player item to load with a real duration', async () => {
  const statuses = [
    { isLoaded: false, duration: 0, error: null },
    { isLoaded: true, duration: 0, error: null },
    { isLoaded: true, duration: 4.876, error: null },
  ];
  let reads = 0;
  const waits = [];

  const ready = await waitForAudioPlayerReady(
    () => statuses[Math.min(reads++, statuses.length - 1)],
    () => true,
    async (millis) => waits.push(millis),
  );

  assert.equal(ready, true);
  assert.equal(reads, 3);
  assert.deepEqual(waits, [25, 25]);
});

test('cancels readiness wait when recording or sheet dismissal supersedes playback', async () => {
  let current = true;
  let reads = 0;

  const ready = await waitForAudioPlayerReady(
    () => {
      reads += 1;
      return { isLoaded: false, duration: 0, error: null };
    },
    () => current,
    async () => {
      current = false;
    },
  );

  assert.equal(ready, false);
  assert.equal(reads, 1);
});

test('surfaces native player load errors', async () => {
  await assert.rejects(
    waitForAudioPlayerReady(
      () => ({ isLoaded: false, duration: 0, error: 'AVPlayerItem failed' }),
      () => true,
    ),
    /AVPlayerItem failed/,
  );
});

function playerAt(position) {
  return {
    currentTime: position,
    currentStatus: { isLoaded: true, duration: 30, error: null },
    sources: [],
    seeks: [],
    playing: false,
    replace(uri) {
      this.sources.push(uri);
      this.currentTime = 0;
    },
    async seekTo(seconds) {
      this.seeks.push(seconds);
      this.currentTime = seconds;
    },
    play() { this.playing = true; },
  };
}

test('resumes the paused item at its native position without reloading or seeking', async () => {
  const player = playerAt(7.25);

  assert.equal(await playAudioRecording(player, 'first.m4a', true, () => true), true);

  assert.equal(player.currentTime, 7.25);
  assert.equal(player.playing, true);
  assert.deepEqual(player.sources, []);
  assert.deepEqual(player.seeks, []);
});

test('starts a different or completed recording from the beginning', async () => {
  for (const position of [7.25, 30]) {
    const player = playerAt(position);

    assert.equal(await playAudioRecording(player, 'next.m4a', false, () => true), true);

    assert.equal(player.currentTime, 0);
    assert.equal(player.playing, true);
    assert.deepEqual(player.sources, ['next.m4a']);
    assert.deepEqual(player.seeks, [0]);
  }
});

test('does not resume after the sheet closes while readiness is being checked', async () => {
  const player = playerAt(7.25);
  let current = true;
  const pending = playAudioRecording(player, 'first.m4a', true, () => current);
  current = false;

  assert.equal(await pending, false);
  assert.equal(player.playing, false);
  assert.equal(player.currentTime, 7.25);
});

test('does not start after a recording operation supersedes the initial seek', async () => {
  const player = playerAt(0);
  let current = true;
  player.seekTo = async () => { current = false; };

  assert.equal(await playAudioRecording(player, 'first.m4a', false, () => current), false);
  assert.equal(player.playing, false);
});
