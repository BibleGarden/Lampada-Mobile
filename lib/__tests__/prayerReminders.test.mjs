import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_REMINDER_TIMES_PER_RULE,
  MAX_REMINDER_TRIGGERS,
  REMINDER_PHRASES,
  describeReminderSchedule,
  expoWeekday,
  formatReminderWeekdays,
  normalizeReminderSchedule,
  parseStoredReminderSchedule,
  reminderWeeklyTriggers,
  shuffleReminderPhrases,
} from '../prayerReminders.ts';

const enabled = (rules) => ({ enabled: true, rules });

test('weekday numbering maps ISO Monday to Expo 2 and Sunday to 1', () => {
  // expo-notifications: 1 = воскресенье … 7 = суббота.
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(expoWeekday), [2, 3, 4, 5, 6, 7, 1]);
});

test('normalization removes invalid entries, sorts, and deduplicates', () => {
  const schedule = normalizeReminderSchedule({
    enabled: true,
    rules: [
      {
        weekdays: [5, 1, 1, 0, 8, 'вт', null],
        times: [
          { hour: 19, minute: 0 },
          { hour: 11, minute: 0 },
          { hour: 19, minute: 0 },
          { hour: 24, minute: 0 },
          { hour: 7, minute: 60 },
          { hour: 7.5, minute: 0 },
        ],
      },
    ],
  });

  assert.deepEqual(schedule, enabled([
    { weekdays: [1, 5], times: [{ hour: 11, minute: 0 }, { hour: 19, minute: 0 }] },
  ]));
});

test('normalization merges rules with identical weekdays and drops empty rules', () => {
  const schedule = normalizeReminderSchedule({
    enabled: true,
    rules: [
      { weekdays: [6, 7], times: [{ hour: 22, minute: 0 }] },
      { weekdays: [7, 6], times: [{ hour: 8, minute: 30 }] },
      { weekdays: [], times: [{ hour: 5, minute: 0 }] },
      { weekdays: [3], times: [] },
    ],
  });

  assert.deepEqual(schedule, enabled([
    { weekdays: [6, 7], times: [{ hour: 8, minute: 30 }, { hour: 22, minute: 0 }] },
  ]));
});

test('normalization caps the number of times in a rule', () => {
  const times = Array.from({ length: MAX_REMINDER_TIMES_PER_RULE + 3 }, (_, i) => ({
    hour: i,
    minute: 0,
  }));
  const schedule = normalizeReminderSchedule({ enabled: true, rules: [{ weekdays: [1], times }] });

  assert.equal(schedule.rules[0].times.length, MAX_REMINDER_TIMES_PER_RULE);
  assert.deepEqual(schedule.rules[0].times[0], { hour: 0, minute: 0 });
});

test('normalization rejects values that are not schedules', () => {
  assert.equal(normalizeReminderSchedule(null), null);
  assert.equal(normalizeReminderSchedule('каждый день в 9'), null);
  assert.equal(normalizeReminderSchedule({ rules: [] }), null);
  assert.equal(normalizeReminderSchedule({ enabled: true }), null);
});

test('corrupted stored values are not treated as schedules', () => {
  assert.equal(parseStoredReminderSchedule(null), null);
  assert.equal(parseStoredReminderSchedule(''), null);
  assert.equal(parseStoredReminderSchedule('{'), null);
  assert.equal(parseStoredReminderSchedule('{"enabled":false}'), null);
  assert.deepEqual(
    parseStoredReminderSchedule('{"enabled":false,"rules":[{"weekdays":[3],"times":[{"hour":7,"minute":5}]}]}'),
    { enabled: false, rules: [{ weekdays: [3], times: [{ hour: 7, minute: 5 }] }] },
  );
});

test('expands rules into WEEKLY triggers using Expo weekday numbering', () => {
  const triggers = reminderWeeklyTriggers(enabled([
    { weekdays: [6, 7], times: [{ hour: 22, minute: 0 }] },
    { weekdays: [1], times: [{ hour: 11, minute: 0 }, { hour: 19, minute: 30 }] },
  ]));

  assert.deepEqual(triggers, [
    { weekday: 2, hour: 11, minute: 0 },  // понедельник
    { weekday: 2, hour: 19, minute: 30 },
    { weekday: 7, hour: 22, minute: 0 },  // суббота
    { weekday: 1, hour: 22, minute: 0 },  // воскресенье
  ]);
});

test('overlapping rules do not create duplicate notifications at the same time', () => {
  const triggers = reminderWeeklyTriggers(enabled([
    { weekdays: [1, 2, 3], times: [{ hour: 9, minute: 0 }] },
    { weekdays: [3, 4], times: [{ hour: 9, minute: 0 }] },
  ]));

  assert.deepEqual(triggers, [
    { weekday: 2, hour: 9, minute: 0 },
    { weekday: 3, hour: 9, minute: 0 },
    { weekday: 4, hour: 9, minute: 0 },
    { weekday: 5, hour: 9, minute: 0 },
  ]);
});

test('a disabled schedule produces no triggers', () => {
  const rules = [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ hour: 9, minute: 0 }] }];
  assert.deepEqual(reminderWeeklyTriggers({ enabled: false, rules }), []);
  assert.equal(reminderWeeklyTriggers({ enabled: true, rules }).length, 7);
});

test('the maximum schedule allowed by the UI fits within the iOS limit', () => {
  const times = Array.from({ length: MAX_REMINDER_TIMES_PER_RULE }, (_, i) => ({
    hour: i * 2,
    minute: 0,
  }));
  const triggers = reminderWeeklyTriggers(enabled([
    { weekdays: [1, 2, 3, 4, 5, 6, 7], times },
  ]));

  assert.equal(triggers.length, 7 * MAX_REMINDER_TIMES_PER_RULE);
  assert.ok(triggers.length <= MAX_REMINDER_TRIGGERS);
});

test('schedules exceeding the iOS limit are capped before scheduling', () => {
  // Такое расписание интерфейс собрать не даёт, но разбор фразы на этапе 2
  // теоретически может: лишние пары «день × время» отсекаются здесь.
  const rules = Array.from({ length: 12 }, (_, i) => ({
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    times: [{ hour: i, minute: 0 }],
  }));
  const triggers = reminderWeeklyTriggers(enabled(rules));

  assert.equal(triggers.length, MAX_REMINDER_TRIGGERS);
  assert.deepEqual(triggers[0], { weekday: 2, hour: 0, minute: 0 });
});

test('renders a schedule as a readable string', () => {
  const schedule = normalizeReminderSchedule({
    enabled: true,
    rules: [
      { weekdays: [1, 2, 3, 4, 5], times: [{ hour: 11, minute: 0 }, { hour: 19, minute: 0 }] },
      { weekdays: [6, 7], times: [{ hour: 22, minute: 0 }] },
    ],
  });

  assert.equal(describeReminderSchedule(schedule), 'Пн–Пт: 11:00, 19:00 · Сб–Вс: 22:00');
});

test('groups weekdays into ranges and labels a full week', () => {
  assert.equal(formatReminderWeekdays([1, 2, 3, 4, 5, 6, 7]), 'Каждый день');
  assert.equal(formatReminderWeekdays([1, 2, 3, 4, 5]), 'Пн–Пт');
  assert.equal(formatReminderWeekdays([6, 7]), 'Сб–Вс');
  assert.equal(formatReminderWeekdays([3]), 'Ср');
  assert.equal(formatReminderWeekdays([1, 3, 5]), 'Пн, Ср, Пт');
  assert.equal(formatReminderWeekdays([1, 2, 5, 6, 7]), 'Пн–Вт, Пт–Вс');
  assert.equal(formatReminderWeekdays([]), '');
});

test('times use leading zeros and an empty schedule renders an empty string', () => {
  assert.equal(
    describeReminderSchedule(enabled([{ weekdays: [7], times: [{ hour: 7, minute: 5 }] }])),
    'Вс: 07:05',
  );
  assert.equal(describeReminderSchedule({ enabled: true, rules: [] }), '');
});

test('shuffling preserves every pool item and changes their order', () => {
  const sequence = [0.9, 0.1, 0.7, 0.3, 0.5, 0.2, 0.8, 0.4, 0.6, 0.05, 0.95];
  let i = 0;
  const shuffled = shuffleReminderPhrases(REMINDER_PHRASES, () => sequence[i++ % sequence.length]);

  assert.equal(shuffled.length, REMINDER_PHRASES.length);
  assert.deepEqual([...shuffled].sort(), [...REMINDER_PHRASES].sort());
  assert.notDeepEqual(shuffled, [...REMINDER_PHRASES]);
});

test('shuffling stays within pool bounds at random value extremes', () => {
  assert.deepEqual(shuffleReminderPhrases(['а', 'б', 'в'], () => 0), ['б', 'в', 'а']);
  assert.deepEqual(shuffleReminderPhrases(['а', 'б', 'в'], () => 1), ['а', 'б', 'в']);
  assert.deepEqual(shuffleReminderPhrases([], () => 0.5), []);
});
