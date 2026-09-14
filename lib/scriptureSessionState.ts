import type { ScriptureDisplay } from './scripture';

export const OFFLINE_SCRIPTURE_TRAIL_LIMIT = 7;

export const shouldDeferLoadedNext = (startedAtIndex: number, currentIndex: number) =>
  startedAtIndex !== currentIndex;

/** Preserve the session trail and append only a small window of saved snapshots. */
export function mergeOfflineTrail(
  current: readonly ScriptureDisplay[],
  cachedNewestFirst: readonly ScriptureDisplay[],
  currentIndex: number,
): ScriptureDisplay[] {
  const seen = new Set(current.map((item) => item.canonicalId));
  const offlineTail = cachedNewestFirst.filter((item) => !seen.has(item.canonicalId));
  const availableSlots = Math.max(0, OFFLINE_SCRIPTURE_TRAIL_LIMIT - current.length);
  return [
    ...current.map((item, index) =>
      index === currentIndex ? { ...item, offline: true } : item,
    ),
    ...offlineTail.slice(0, availableSlots),
  ];
}
