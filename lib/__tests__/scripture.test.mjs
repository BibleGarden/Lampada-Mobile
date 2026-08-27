import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptureRequest,
  formatScriptureReference,
  parseScriptureSelection,
  toScriptureDisplay,
} from '../scripture.ts';

const selection = {
  language: 'ru',
  canonical: {
    canonical_id: 'v3:19.023.001-006',
    book_number: 19,
    chapter_number: 23,
    verse_start: 1,
    verse_end: 6,
  },
  passage: {
    translation: 1,
    translation_alias: 'syn',
    book_number: 19,
    chapter_number: 22,
    verse_start: 1,
    verse_end: 6,
    title: null,
    text: 'Господь — Пастырь мой.',
  },
  source: 'safe_pool',
  fallback_reason: 'empty_topic',
  history_reset: false,
};

test('privacy boundary omits replies from the serialized request', () => {
  const request = buildScriptureRequest({
    language: 'ru',
    translation: 1,
    topic: 'Нужна мудрость',
    replies: ['секретный ответ'],
    shareReplies: false,
    shownCanonicalIds: [],
  });

  const serialized = JSON.stringify(request);
  assert.equal(serialized.includes('секретный ответ'), false);
  assert.equal('user_replies' in request, false);
});

test('request builder applies server limits and keeps 200 newest valid unique ids', () => {
  const ids = Array.from(
    { length: 205 },
    (_, index) => `v3:19.${String(index + 1).padStart(3, '0')}.001-001`,
  );
  const request = buildScriptureRequest({
    language: 'ru',
    topic: '🙂'.repeat(501),
    replies: [' ', 'а'.repeat(1001), ...Array(12).fill('ответ')],
    shareReplies: true,
    shownCanonicalIds: ['invalid', ...ids, ids.at(-1)],
  });

  assert.equal(Array.from(request.topic).length, 500);
  assert.equal(request.user_replies.length, 10);
  assert.equal(Array.from(request.user_replies[0]).length, 1000);
  assert.equal(request.exclude_canonical_ids.length, 200);
  assert.equal(request.exclude_canonical_ids[0], ids.at(-1));
  assert.equal(request.exclude_canonical_ids.includes('invalid'), false);
});

test('displayed reference uses translated passage coordinates, not canonical coordinates', () => {
  assert.equal(formatScriptureReference(selection.passage, { 19: 'Псалом' }), 'Псалом 22:1–6');
  assert.equal(toScriptureDisplay(selection, { 19: 'Псалом' }).reference, 'Псалом 22:1–6');
});

test('parser accepts nullable title, missing fallback reason and unknown future source', () => {
  const future = structuredClone(selection);
  delete future.fallback_reason;
  future.source = 'future_source';

  assert.deepEqual(parseScriptureSelection(future), future);
});

test('parser rejects malformed canonical ids and incomplete passages', () => {
  assert.equal(
    parseScriptureSelection({
      ...selection,
      canonical: { ...selection.canonical, canonical_id: 'old-id' },
    }),
    null,
  );
  assert.equal(parseScriptureSelection({ ...selection, passage: { text: 'missing fields' } }), null);
});
