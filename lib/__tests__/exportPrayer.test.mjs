import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrayerExportText, prayerExportTitle } from '../exportPrayer.ts';
import { screenMessages } from '../locales/screens.ts';

// The real interface strings, resolved the way lib/i18n does it.
const translator = (language) => (key, params = {}) =>
  (screenMessages[language][key] ?? screenMessages.en[key] ?? key).replace(
    /\{(\w+)\}/g,
    (placeholder, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder,
  );

const t = translator('en');

const entry = {
  topic: 'Fear before a difficult talk',
  startedAt: '2026-09-06T09:41:00.000Z',
  elapsedSec: 720,
  takeaway: 'Trust grows in small steps.',
};

const detail = {
  answers: [
    { questionIndex: 1, question: 'What is the fear about?', text: 'Losing his trust.' },
    { questionIndex: 0, question: 'What are you bringing?', text: 'A heavy conversation.' },
  ],
  recordings: [
    { id: 1, questionIndex: 1, uri: 'file:///a.m4a', durationSec: 12, transcript: 'I kept thinking all night.' },
    { id: 2, questionIndex: 1, uri: 'file:///b.m4a', durationSec: 8, transcript: null },
    { id: 3, questionIndex: 4, uri: 'file:///c.m4a', durationSec: 5, transcript: 'A late thought.' },
  ],
};

const favorites = [
  { id: 'f1', reference: 'Psalm 23:1', text: 'The Lord is my shepherd; I shall not want.' },
];

test('every part carries a label and the sections are split by separators', () => {
  const text = buildPrayerExportText(entry, detail, favorites, t, 'en-US', 'Lampada');
  const lines = text.split('\n');

  assert.equal(lines[0], 'Topic: Fear before a difficult talk');
  assert.match(lines[1], /^Date: .*2026/);
  assert.equal(lines[2], 'Duration: 12 min');
  assert.deepEqual(lines.slice(3), [
    '',
    '———',
    '',
    'Question 1: What are you bringing?',
    'Answer: A heavy conversation.',
    '',
    'Question 2: What is the fear about?',
    'Answer: Losing his trust.',
    'Voice note: I kept thinking all night.',
    '',
    // An orphan recording keeps the running question numbering and has no answer line.
    'Question 3',
    'Voice note: A late thought.',
    '',
    '———',
    '',
    'Saved passages:',
    '• Psalm 23:1 — The Lord is my shepherd; I shall not want.',
    '',
    'Takeaway:',
    'Trust grows in small steps.',
    '',
    '———',
    'Lampada',
  ]);
  assert.ok(!text.includes('file:///'), 'file URIs must never leave the device');
  assert.ok(!text.includes('.m4a'));
});

test('a recording without a transcript adds nothing', () => {
  const text = buildPrayerExportText(
    entry,
    {
      answers: [{ questionIndex: 0, question: 'Q', text: '' }],
      recordings: [{ id: 9, questionIndex: 0, uri: 'file:///x.m4a', durationSec: 3, transcript: '  ' }],
    },
    [],
    t,
    'en-US',
  );
  assert.ok(!text.includes('Voice note'));
  assert.ok(!text.includes('Answer:'), 'an empty answer leaves out its label');
  assert.ok(text.includes('\n\n———\n\nQuestion 1: Q\n\n———\n\nTakeaway:'));
});

test('an empty topic falls back to the localized prayer label', () => {
  const text = buildPrayerExportText(
    { topic: '   ', startedAt: '2026-09-06T09:41:00.000Z', elapsedSec: 0, takeaway: '' },
    null,
    [],
    t,
    'en-US',
  );
  const lines = text.split('\n');
  assert.equal(lines[0], 'Topic: Prayer');
  assert.ok(!text.includes('Duration:'), 'a zero duration is left out of the meta block');
  assert.equal(lines.at(-1), 'Lampada');
});

test('a broken start date drops the date line instead of printing Invalid Date', () => {
  const text = buildPrayerExportText(
    { topic: 'Topic', startedAt: 'not a date', elapsedSec: 0, takeaway: '' },
    null,
    [],
    t,
    'en-US',
  );
  assert.equal(text, 'Topic: Topic\n\n———\nLampada');
});

test('a multi-line answer keeps its own line breaks', () => {
  const text = buildPrayerExportText(
    { ...entry, takeaway: '' },
    { answers: [{ questionIndex: 0, question: 'Q', text: 'first\nsecond' }], recordings: [] },
    [],
    t,
    'en-US',
  );
  assert.ok(text.includes('Question 1: Q\nAnswer: first\nsecond\n'));
});

test('the Russian and Ukrainian exports use their own labels', () => {
  const ru = buildPrayerExportText(entry, detail, favorites, translator('ru'), 'ru-RU');
  assert.ok(ru.includes('Тема: Fear before a difficult talk'));
  assert.ok(ru.includes('Дата: '));
  assert.ok(ru.includes('Длительность: 12 мин'));
  assert.ok(ru.includes('Вопрос 1: What are you bringing?'));
  assert.ok(ru.includes('Ответ: A heavy conversation.'));
  assert.ok(ru.includes('Голосовая запись: I kept thinking all night.'));
  assert.ok(ru.includes('Сохранённые цитаты:'));
  assert.ok(ru.includes('Итог:'));

  const uk = buildPrayerExportText(entry, detail, favorites, translator('uk'), 'uk-UA');
  assert.ok(uk.includes('Тема: Fear before a difficult talk'));
  assert.ok(uk.includes('Тривалість: 12 хв'));
  assert.ok(uk.includes('Питання 2: What is the fear about?'));
  assert.ok(uk.includes('Відповідь: Losing his trust.'));
  assert.ok(uk.includes('Голосовий запис: I kept thinking all night.'));
  assert.ok(uk.includes('Збережені цитати:'));
  assert.ok(uk.includes('Підсумок:'));
});

test('the share title stays the topic and falls back to the prayer label', () => {
  assert.equal(prayerExportTitle({ ...entry, topic: '' }, translator('ru')), 'Молитва');
  assert.equal(prayerExportTitle(entry, t), 'Fear before a difficult talk');
});
