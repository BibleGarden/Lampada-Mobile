export function isVisibleScreen(focused: boolean, appState: string | null, uncovered: boolean): boolean {
  return focused && appState === 'active' && uncovered;
}

export function backgroundDeadlineDelay(
  nowMs: number,
  endsAtMs: number | null,
  expired: boolean,
): number | null {
  if (endsAtMs === null || expired) return null;
  return Math.max(0, endsAtMs - nowMs);
}
