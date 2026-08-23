export const dayKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Последние 7 дней: [0] — 6 дней назад, [6] — сегодня; true = молился */
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
