export type SessionTimerSnapshot = {
  elapsed: number;
  remaining: number | null;
};

export function sessionTimerSnapshot(
  startedAtMs: number,
  endsAtMs: number | null,
  nowMs: number,
): SessionTimerSnapshot {
  const effectiveNowMs = Math.max(startedAtMs, nowMs);
  // A timed prayer's duration ends at the deadline: background waiting or time
  // on the summary screen after zero does not count toward it. Extending the
  // timer or returning to the prayer moves the deadline itself.
  const prayerNowMs = endsAtMs === null ? effectiveNowMs : Math.min(effectiveNowMs, endsAtMs);
  return {
    elapsed: Math.floor((prayerNowMs - startedAtMs) / 1_000),
    remaining:
      endsAtMs === null
        ? null
        : Math.max(0, Math.ceil((endsAtMs - effectiveNowMs) / 1_000)),
  };
}

export function adjustSessionTimer(
  endsAtMs: number,
  nowMs: number,
  deltaSeconds: number,
  minimumRemainingSeconds = 5,
) {
  const currentRemaining = Math.max(0, Math.ceil((endsAtMs - nowMs) / 1_000));
  const remaining = Math.max(currentRemaining + deltaSeconds, minimumRemainingSeconds);
  return {
    endsAtMs: nowMs + remaining * 1_000,
    remaining,
    actualDeltaSeconds: remaining - currentRemaining,
  };
}
