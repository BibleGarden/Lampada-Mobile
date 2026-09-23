// Длительность молитвы на экране настройки: 0 = без таймера, иначе минуты.

export const DEFAULT_PRAYER_MINUTES = 10;
export const MAX_PRAYER_MINUTES = 120;

const isPrayerMinutes = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_PRAYER_MINUTES;

/**
 * Длительность последней начатой молитвы из `meta.prayer_minutes`. Записи нет
 * только до первой молитвы — тогда действует значение по умолчанию. Запись
 * пишет лишь приложение, поэтому испорченное значение — ошибка, а не повод
 * молча подставить умолчание.
 */
export function parseStoredPrayerMinutes(value: string | null): number {
  if (value === null) return DEFAULT_PRAYER_MINUTES;
  const minutes = Number(value);
  if (!/^\d+$/.test(value) || !isPrayerMinutes(minutes)) {
    throw new Error(`Invalid stored prayer duration: ${value}`);
  }
  return minutes;
}

export function serializePrayerMinutes(minutes: number): string {
  if (!isPrayerMinutes(minutes)) throw new Error(`Invalid prayer duration: ${minutes}`);
  return String(minutes);
}
