import assert from 'node:assert/strict';
import test from 'node:test';

import { replyTexts } from '../answerContext.ts';

const rec = (transcript = null) => ({ transcript });

test('расшифровка голосового ответа участвует наравне с текстом', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: '', recordings: [rec('Боюсь не справиться')] } }),
    ['Боюсь не справиться'],
  );
});

test('запись без расшифровки не добавляет в контекст ничего', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: 'Устал', recordings: [rec(), rec('')] } }),
    ['Устал'],
  );
});

test('внутри ответа текст идёт перед расшифровками своих записей', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: 'Коротко', recordings: [rec('Первая'), rec('Вторая')] } }),
    ['Коротко', 'Первая', 'Вторая'],
  );
});

test('ответы собираются по возрастанию индекса вопроса', () => {
  assert.deepEqual(
    replyTexts({
      2: { text: 'Третий', recordings: [] },
      0: { text: '', recordings: [rec('Первый')] },
      1: { text: 'Второй', recordings: [] },
    }),
    ['Первый', 'Второй', 'Третий'],
  );
});

test('пробельные реплики отбрасываются, остальные обрезаются', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: '   ', recordings: [rec('  С полями  ')] } }),
    ['С полями'],
  );
});

test('сессия без ответов даёт пустой контекст', () => {
  assert.deepEqual(replyTexts({}), []);
});
