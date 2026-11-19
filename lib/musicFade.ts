export type MusicFadeOut = {
  startedAtMs: number;
  endsAtMs: number;
  fromVolume: number;
};

export function startMusicFadeOut(
  fromVolume: number,
  nowMs: number,
  durationMs: number,
): MusicFadeOut {
  return { startedAtMs: nowMs, endsAtMs: nowMs + durationMs, fromVolume };
}

/**
 * A repeated request can only speed up an ongoing fade-out: a longer request
 * never pushes its end further. The hastened fade continues from the current
 * volume, without a jump.
 */
export function hastenMusicFadeOut(
  fade: MusicFadeOut,
  nowMs: number,
  durationMs: number,
): MusicFadeOut {
  if (nowMs + durationMs >= fade.endsAtMs) return fade;
  return startMusicFadeOut(musicFadeOutVolume(fade, nowMs), nowMs, durationMs);
}

/** Volume on a cosine curve, like the track crossfade; 0 at the end. */
export function musicFadeOutVolume(fade: MusicFadeOut, nowMs: number): number {
  const span = fade.endsAtMs - fade.startedAtMs;
  const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (nowMs - fade.startedAtMs) / span));
  return progress >= 1 ? 0 : fade.fromVolume * Math.cos(progress * Math.PI / 2);
}
