import assert from 'node:assert/strict';
import test from 'node:test';

import { waitForAudioPlayerReady } from '../audioPlayerOperation.ts';

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
