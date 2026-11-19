export const dayKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Bounds of the local day `YYYY-MM-DD` in the `sessions.started_at` format:
 * [midnight, next midnight). A moment falls within them exactly when `dayKey`
 * yields that day; a DST-transition day lasts 23 or 25 hours.
 */
export const localDayBounds = (day: string): [string, string] => {
  const [y, m, d] = day.split('-').map(Number);
  return [new Date(y, m - 1, d).toISOString(), new Date(y, m - 1, d + 1).toISOString()];
};

/** The last 7 days: [0] — 6 days ago, [6] — today; true = prayed */
export async function getWeekIndicators(
  loadPrayedDays: (firstDay: string, lastDay: string) => Promise<string[]>,
  today = new Date(),
): Promise<boolean[]> {
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (6 - i));
    return dayKey(day);
  });
  const prayed = new Set(await loadPrayedDays(days[0], days[6]));
  return days.map((day) => prayed.has(day));
}
