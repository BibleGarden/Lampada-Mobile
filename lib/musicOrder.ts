/**
 * Returns the catalog order as a cycle with a random start position.
 * With more than one track, the previous session's start is not repeated.
 */
export function prayerTrackOrder(
  trackCount: number,
  previousStart: number | null,
  random: () => number = Math.random,
): number[] {
  if (trackCount <= 0) return [];

  const all = Array.from({ length: trackCount }, (_, index) => index);
  const candidates = all.filter((index) => index !== previousStart);
  const pool = candidates.length > 0 ? candidates : all;
  const unit = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  const startIndex = pool[Math.floor(unit * pool.length)] ?? 0;

  return [...all.slice(startIndex), ...all.slice(0, startIndex)];
}

/**
 * Rotates a track cycle so that the track with the given id comes first and
 * the order of the rest is kept. An unknown or missing id leaves the cycle as
 * it is.
 */
export function startFromTrack<T extends { id: string }>(
  tracks: readonly T[],
  id: string | null | undefined,
): T[] {
  const start = tracks.findIndex((track) => track.id === id);
  return start <= 0 ? [...tracks] : [...tracks.slice(start), ...tracks.slice(0, start)];
}
