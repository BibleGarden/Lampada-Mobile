import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentReportTarget } from '../contentReportTarget.ts';

const scripture = {
  reference: 'Psalm 23:1–3',
  title: 'The Lord is my shepherd',
  text: 'The Lord is my shepherd; I shall not want.',
};

test('the question tab reports only its displayed question', () => {
  assert.deepEqual(getContentReportTarget('question', 'What gives you hope?', false, scripture), {
    contentType: 'question',
    contentText: 'What gives you hope?',
  });
  assert.equal(getContentReportTarget('question', '  ', false, scripture), null);
  assert.equal(getContentReportTarget('question', 'Still generating', true, scripture), null);
});

test('the scripture tab reports the full passage shown in the reader', () => {
  assert.deepEqual(getContentReportTarget('scripture', 'Private question', false, scripture), {
    contentType: 'scripture',
    contentText: 'Psalm 23:1–3\n\nThe Lord is my shepherd\n\nThe Lord is my shepherd; I shall not want.',
  });
  assert.deepEqual(getContentReportTarget('scripture', '', false, { ...scripture, title: null }), {
    contentType: 'scripture',
    contentText: 'Psalm 23:1–3\n\nThe Lord is my shepherd; I shall not want.',
  });
  assert.equal(getContentReportTarget('scripture', 'Private question', false, undefined), null);
});
