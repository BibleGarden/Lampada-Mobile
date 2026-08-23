/**
 * Возвращает циклический порядок каталога со случайной стартовой позицией.
 * Если треков больше одного, старт предыдущей сессии не повторяется.
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
