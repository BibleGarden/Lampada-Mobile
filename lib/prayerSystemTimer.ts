export type PrayerSystemTimerState = {
  startedAtMs: number;
  endsAtMs: number;
};

export async function startPrayerSystemTimer(_timer: PrayerSystemTimerState): Promise<void> {}

export async function updatePrayerSystemTimer(_timer: PrayerSystemTimerState): Promise<void> {}

export async function stopPrayerSystemTimer(): Promise<void> {}
