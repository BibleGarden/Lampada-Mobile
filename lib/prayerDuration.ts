// Prayer duration on the settings screen: 0 = no timer, otherwise minutes.

export const DEFAULT_PRAYER_MINUTES = 10;
export const MAX_PRAYER_MINUTES = 120;

const isPrayerMinutes = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_PRAYER_MINUTES;

/**
 * Duration of the last started prayer from `meta.prayer_minutes`. The record is
 * missing only before the first prayer — the default applies then. Only the app
 * writes this record, so a corrupt value is an error, not a reason to silently
 * substitute the default.
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
