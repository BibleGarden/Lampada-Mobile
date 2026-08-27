import type { ScriptureDisplay } from './scripture';

export const shouldDeferLoadedNext = (startedAtIndex: number, currentIndex: number) =>
  startedAtIndex !== currentIndex;

/** Preserve the session trail and append older persistent snapshots once. */
export function mergeOfflineTrail(
  current: readonly ScriptureDisplay[],
  cachedNewestFirst: readonly ScriptureDisplay[],
  currentIndex: number,
): ScriptureDisplay[] {
  const seen = new Set(current.map((item) => item.canonicalId));
  const offlineTail = cachedNewestFirst.filter((item) => !seen.has(item.canonicalId));
  return [
    ...current.map((item, index) =>
      index === currentIndex ? { ...item, offline: true } : item,
    ),
    ...offlineTail,
  ];
}
