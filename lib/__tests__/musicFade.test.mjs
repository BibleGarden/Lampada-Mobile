import assert from 'node:assert/strict';
import test from 'node:test';
import { hastenMusicFadeOut, musicFadeOutVolume, startMusicFadeOut } from '../musicFade.ts';

test('fades the music volume out to silence over the requested time', () => {
  const fade = startMusicFadeOut(0.28, 1_000, 3_000);
  assert.equal(musicFadeOutVolume(fade, 1_000), 0.28);
  assert.ok(Math.abs(musicFadeOutVolume(fade, 2_500) - 0.28 * Math.SQRT1_2) < 1e-9);
  assert.equal(musicFadeOutVolume(fade, 4_000), 0);
  assert.equal(musicFadeOutVolume(fade, 60_000), 0);
});

test('a shorter request hastens a running fade without a volume jump', () => {
  const fade = startMusicFadeOut(0.28, 0, 3_000);
  const before = musicFadeOutVolume(fade, 1_000);
  const hastened = hastenMusicFadeOut(fade, 1_000, 700);
  assert.equal(hastened.endsAtMs, 1_700);
  assert.equal(musicFadeOutVolume(hastened, 1_000), before);
  assert.equal(musicFadeOutVolume(hastened, 1_700), 0);
});

test('a longer request does not postpone a running fade', () => {
  const fade = startMusicFadeOut(0.28, 0, 700);
  assert.equal(hastenMusicFadeOut(fade, 500, 3_000), fade);
});
