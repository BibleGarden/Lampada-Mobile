export function isVisibleScreen(focused: boolean, appState: string | null, uncovered: boolean): boolean {
  return focused && appState === 'active' && uncovered;
}

export function backgroundDeadlineDelay(
  nowMs: number,
  endsAtMs: number | null,
  musicOn: boolean,
  expired: boolean,
): number | null {
  if (!musicOn || endsAtMs === null || expired) return null;
  return Math.max(0, endsAtMs - nowMs);
}
