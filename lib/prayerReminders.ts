import type { UiLanguage } from './uiLanguage';
import { reminderCopy } from './locales/reminders.ts';

// Pure model of the local prayer-reminder schedule.
//
// The module deliberately does not know how the schedule was entered: today the
// settings screen assembles it from picked days and times, and AI phrase
// parsing may sit on top later. Hence no expo-notifications and no
// react-native here — only validation, expansion into triggers, and rendering.
//
// Weekdays inside the model are ISO: 1 = Monday … 7 = Sunday. This matches the
// order in which days are shown to the user. expo-notifications numbers them
// differently (1 = Sunday), and the conversion lives in exactly one place —
// `expoWeekday`.

export type ReminderTime = {
  hour: number;
  minute: number;
};

/** One rule: a set of weekdays and the times within each of those days. */
export type ReminderRule = {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  times: ReminderTime[];
};

export type ReminderSchedule = {
  enabled: boolean;
  rules: ReminderRule[];
};

/** WEEKLY trigger in expo-notifications numbering: 1 = Sunday … 7 = Saturday. */
export type ReminderWeeklyTrigger = {
  weekday: number;
  hour: number;
  minute: number;
};

export const WEEKDAY_SHORT_NAMES = reminderCopy.ru.weekdays;
export const weekdayShortNames = (language: UiLanguage): readonly string[] => reminderCopy[language].weekdays;
export const reminderPhrases = (language: UiLanguage): readonly string[] => reminderCopy[language].phrases;

/** There cannot be more rules than weekdays: they would duplicate each other. */
export const MAX_REMINDER_RULES = 7;
/** A sane cap on times within one rule; protects both the iOS limit and the UI. */
export const MAX_REMINDER_TIMES_PER_RULE = 8;
/**
 * iOS keeps at most 64 scheduled notifications per app. Each WEEKLY trigger
 * occupies exactly one slot, so extras are dropped here rather than silently
 * lost by the system.
 */
export const MAX_REMINDER_TRIGGERS = 64;

/**
 * Warm short phrases for the notification body. The text is handed to the OS
 * at scheduling time, so rotation is only possible through rescheduling.
 */
export const REMINDER_PHRASES: readonly string[] = reminderCopy.ru.phrases;

/** Fresh-install schedule: reminders off, the placeholder is every day at 9:00. */
export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = {
  enabled: false,
  rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ hour: 9, minute: 0 }] }],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const minutesOfDay = (time: ReminderTime) => time.hour * 60 + time.minute;

const normalizeWeekdays = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  for (const day of value) {
    if (isInteger(day) && day >= 1 && day <= 7) unique.add(day);
  }
  return [...unique].sort((a, b) => a - b);
};

const normalizeTimes = (value: unknown): ReminderTime[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Map<number, ReminderTime>();
  for (const item of value) {
    if (!isObject(item)) continue;
    const { hour, minute } = item;
    if (!isInteger(hour) || hour < 0 || hour > 23) continue;
    if (!isInteger(minute) || minute < 0 || minute > 59) continue;
    const time = { hour, minute };
    unique.set(minutesOfDay(time), time);
  }
  return [...unique.values()]
    .sort((a, b) => minutesOfDay(a) - minutesOfDay(b))
    .slice(0, MAX_REMINDER_TIMES_PER_RULE);
};

/**
 * Coerces an arbitrary value into a valid schedule, or returns `null`. Rules
 * with the same weekdays are merged: two identical weekday sets are one rule
 * with combined times, both in the UI and in the triggers.
 */
export function normalizeReminderSchedule(value: unknown): ReminderSchedule | null {
  if (!isObject(value) || typeof value.enabled !== 'boolean') return null;
  if (!Array.isArray(value.rules)) return null;

  const merged = new Map<string, ReminderRule>();
  for (const raw of value.rules) {
    if (!isObject(raw)) continue;
    const weekdays = normalizeWeekdays(raw.weekdays);
    const times = normalizeTimes(raw.times);
    if (weekdays.length === 0 || times.length === 0) continue;
    const key = weekdays.join(',');
    const existing = merged.get(key);
    if (existing) {
      existing.times = normalizeTimes([...existing.times, ...times]);
    } else {
      merged.set(key, { weekdays, times });
    }
  }

  const rules = [...merged.values()]
    .sort((a, b) => a.weekdays[0] - b.weekdays[0] || minutesOfDay(a.times[0]) - minutesOfDay(b.times[0]))
    .slice(0, MAX_REMINDER_RULES);

  return { enabled: value.enabled, rules };
}

/** Reads the JSON value stored in `meta`; a corrupt value is not a schedule. */
export function parseStoredReminderSchedule(value: string | null): ReminderSchedule | null {
  if (!value) return null;
  try {
    return normalizeReminderSchedule(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

/** ISO day (1 = Monday) → expo-notifications numbering (1 = Sunday). */
export const expoWeekday = (isoWeekday: number) => (isoWeekday % 7) + 1;

/**
 * Expands the rules into a flat set of WEEKLY triggers. A disabled schedule
 * yields no triggers at all, so the scheduler needs no separate
 * "reminders off" branch.
 */
export function reminderWeeklyTriggers(schedule: ReminderSchedule): ReminderWeeklyTrigger[] {
  if (!schedule.enabled) return [];
  const seen = new Set<number>();
  const triggers: ReminderWeeklyTrigger[] = [];
  // Traversal goes by weekday starting Monday, then by time within the day:
  // this way the first phrase of the shuffled pool goes to the nearest weekday.
  for (let isoWeekday = 1; isoWeekday <= 7; isoWeekday += 1) {
    const times = new Map<number, ReminderTime>();
    for (const rule of schedule.rules) {
      if (!rule.weekdays.includes(isoWeekday)) continue;
      for (const time of rule.times) times.set(minutesOfDay(time), time);
    }
    const ordered = [...times.values()].sort((a, b) => minutesOfDay(a) - minutesOfDay(b));
    for (const time of ordered) {
      const key = isoWeekday * 1440 + minutesOfDay(time);
      if (seen.has(key)) continue;
      seen.add(key);
      triggers.push({ weekday: expoWeekday(isoWeekday), hour: time.hour, minute: time.minute });
    }
  }
  return triggers.slice(0, MAX_REMINDER_TRIGGERS);
}

const pad = (value: number) => String(value).padStart(2, '0');

export const formatReminderTime = (time: ReminderTime) => `${pad(time.hour)}:${pad(time.minute)}`;

/** Renders ranges and lists of short weekday names ("Mon–Fri", "Sat–Sun",
 *  "Mon, Wed, Fri"), or the "Every day" label. */
export function formatReminderWeekdays(weekdays: readonly number[], language: UiLanguage = 'ru'): string {
  if (weekdays.length === 0) return '';
  if (weekdays.length === 7) return reminderCopy[language].everyDay;
  const names = weekdayShortNames(language);
  const runs: number[][] = [];
  for (const day of weekdays) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1] + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) =>
      run.length === 1
        ? names[run[0] - 1]
        : `${names[run[0] - 1]}–${names[run[run.length - 1] - 1]}`,
    )
    .join(', ');
}

/** Human-readable schedule string: "Mon–Fri: 11:00, 19:00 · Sat–Sun: 22:00". */
export function describeReminderSchedule(schedule: ReminderSchedule, language: UiLanguage = 'ru'): string {
  return schedule.rules
    .filter((rule) => rule.weekdays.length > 0 && rule.times.length > 0)
    .map(
      (rule) =>
        `${formatReminderWeekdays(rule.weekdays, language)}: ${rule.times.map(formatReminderTime).join(', ')}`,
    )
    .join(' · ');
}

/** Fisher–Yates shuffle with an injectable source of randomness. */
export function shuffleReminderPhrases(
  pool: readonly string[] = REMINDER_PHRASES,
  random: () => number = Math.random,
): string[] {
  const items = [...pool];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const unit = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
    const j = Math.floor(unit * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
