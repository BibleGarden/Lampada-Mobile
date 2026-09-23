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
 * Повторный запрос может только ускорить уже идущее затухание: более долгий
 * запрос не отодвигает его конец. Ускоренное затухание продолжается с текущей
 * громкости, без скачка.
 */
export function hastenMusicFadeOut(
  fade: MusicFadeOut,
  nowMs: number,
  durationMs: number,
): MusicFadeOut {
  if (nowMs + durationMs >= fade.endsAtMs) return fade;
  return startMusicFadeOut(musicFadeOutVolume(fade, nowMs), nowMs, durationMs);
}

/** Громкость на косинусной кривой, как у кроссфейда треков; 0 в конце. */
export function musicFadeOutVolume(fade: MusicFadeOut, nowMs: number): number {
  const span = fade.endsAtMs - fade.startedAtMs;
  const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (nowMs - fade.startedAtMs) / span));
  return progress >= 1 ? 0 : fade.fromVolume * Math.cos(progress * Math.PI / 2);
}
