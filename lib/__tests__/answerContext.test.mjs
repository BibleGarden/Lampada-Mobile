import assert from 'node:assert/strict';
import test from 'node:test';

import { replyTexts } from '../answerContext.ts';

const rec = (transcript = null) => ({ transcript });

test('voice answer transcripts contribute alongside text', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: '', recordings: [rec('Боюсь не справиться')] } }),
    ['Боюсь не справиться'],
  );
});

test('a recording without a transcript adds nothing to the context', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: 'Устал', recordings: [rec(), rec('')] } }),
    ['Устал'],
  );
});

test('answer text precedes its recording transcripts', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: 'Коротко', recordings: [rec('Первая'), rec('Вторая')] } }),
    ['Коротко', 'Первая', 'Вторая'],
  );
});

test('answers are collected in ascending question index order', () => {
  assert.deepEqual(
    replyTexts({
      2: { text: 'Третий', recordings: [] },
      0: { text: '', recordings: [rec('Первый')] },
      1: { text: 'Второй', recordings: [] },
    }),
    ['Первый', 'Второй', 'Третий'],
  );
});

test('whitespace-only entries are discarded and remaining entries are trimmed', () => {
  assert.deepEqual(
    replyTexts({ 0: { text: '   ', recordings: [rec('  С полями  ')] } }),
    ['С полями'],
  );
});

test('a session without answers produces an empty context', () => {
  assert.deepEqual(replyTexts({}), []);
});
