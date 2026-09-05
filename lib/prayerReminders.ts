import type { UiLanguage } from './uiLanguage';
import { reminderCopy } from './locales/reminders.ts';

// Чистая модель расписания локальных напоминаний о молитве.
//
// Модуль намеренно не знает, каким способом расписание было задано: сейчас его
// собирает экран настроек из выбора дней и времени, позже сверху может лечь
// разбор фразы ИИ. Поэтому здесь нет ни expo-notifications, ни react-native —
// только валидация, разворачивание в триггеры и рендер строки.
//
// Дни недели внутри модели — ISO: 1 = понедельник … 7 = воскресенье. Это
// совпадает с порядком, в котором дни показываются пользователю. Нумерация
// expo-notifications другая (1 = воскресенье), и перевод выполняется ровно в
// одном месте — `expoWeekday`.

export type ReminderTime = {
  hour: number;
  minute: number;
};

/** Одно правило: набор дней недели и времена внутри каждого из этих дней. */
export type ReminderRule = {
  /** ISO-дни недели, 1 = понедельник … 7 = воскресенье. */
  weekdays: number[];
  times: ReminderTime[];
};

export type ReminderSchedule = {
  enabled: boolean;
  rules: ReminderRule[];
};

/** WEEKLY-триггер в нумерации expo-notifications: 1 = воскресенье … 7 = суббота. */
export type ReminderWeeklyTrigger = {
  weekday: number;
  hour: number;
  minute: number;
};

export const WEEKDAY_SHORT_NAMES = reminderCopy.ru.weekdays;
export const weekdayShortNames = (language: UiLanguage): readonly string[] => reminderCopy[language].weekdays;
export const reminderPhrases = (language: UiLanguage): readonly string[] => reminderCopy[language].phrases;

/** Правил больше, чем дней в неделе, быть не может: они бы дублировали друг друга. */
export const MAX_REMINDER_RULES = 7;
/** Разумный потолок времён в одном правиле; защищает и лимит iOS, и интерфейс. */
export const MAX_REMINDER_TIMES_PER_RULE = 8;
/**
 * iOS держит не больше 64 запланированных уведомлений на приложение. Каждый
 * WEEKLY-триггер занимает ровно один слот, поэтому лишние отбрасываются здесь,
 * а не молча теряются в системе.
 */
export const MAX_REMINDER_TRIGGERS = 64;

/**
 * Тёплые короткие фразы для тела уведомления. Текст уносится в систему в момент
 * планирования, поэтому ротация возможна только за счёт перепланирования.
 */
export const REMINDER_PHRASES: readonly string[] = reminderCopy.ru.phrases;

/** Расписание новой установки: напоминания выключены, заготовка — каждый день в 9:00. */
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
 * Приводит произвольное значение к валидному расписанию либо возвращает `null`.
 * Правила с одинаковым набором дней сливаются: два одинаковых набора дней — это
 * одно правило с объединёнными временами, и в интерфейсе, и в триггерах.
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

/** Читает сохранённое в `meta` JSON-значение; повреждённое значение — не расписание. */
export function parseStoredReminderSchedule(value: string | null): ReminderSchedule | null {
  if (!value) return null;
  try {
    return normalizeReminderSchedule(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

/** ISO-день (1 = понедельник) → нумерация expo-notifications (1 = воскресенье). */
export const expoWeekday = (isoWeekday: number) => (isoWeekday % 7) + 1;

/**
 * Разворачивает правила в плоский набор WEEKLY-триггеров. Выключенное
 * расписание триггеров не даёт вовсе, поэтому планировщику не нужна отдельная
 * ветка «напоминания отключены».
 */
export function reminderWeeklyTriggers(schedule: ReminderSchedule): ReminderWeeklyTrigger[] {
  if (!schedule.enabled) return [];
  const seen = new Set<number>();
  const triggers: ReminderWeeklyTrigger[] = [];
  // Порядок обхода — по дням недели с понедельника, внутри дня по времени:
  // так первая фраза перетасованного пула достаётся ближайшему дню недели.
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

/** «Пн–Пт», «Сб–Вс», «Пн, Ср, Пт», «Каждый день». */
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

/** Человеческая строка расписания: «Пн–Пт: 11:00, 19:00 · Сб–Вс: 22:00». */
export function describeReminderSchedule(schedule: ReminderSchedule, language: UiLanguage = 'ru'): string {
  return schedule.rules
    .filter((rule) => rule.weekdays.length > 0 && rule.times.length > 0)
    .map(
      (rule) =>
        `${formatReminderWeekdays(rule.weekdays, language)}: ${rule.times.map(formatReminderTime).join(', ')}`,
    )
    .join(' · ');
}

/** Перетасовка Фишера — Йетса с внедряемым источником случайности. */
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
