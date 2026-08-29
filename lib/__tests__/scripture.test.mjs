import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptureCompactText,
  buildScriptureRequest,
  buildScriptureTextSegments,
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

test('request uses the language and translation chosen in settings', () => {
  const request = buildScriptureRequest({
    language: 'en',
    translation: 16,
    topic: 'hope',
    replies: [],
    shareReplies: false,
    shownCanonicalIds: [],
  });
  assert.equal(request.language, 'en');
  assert.equal(request.translation, 16);
});

test('request builder applies server limits and keeps 30 newest valid unique ids', () => {
  const ids = Array.from(
    { length: 35 },
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
  assert.equal(request.exclude_canonical_ids.length, 30);
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

test('parser accepts structured verses and highlights only translated passage coordinates', () => {
  const highlighted = structuredClone(selection);
  highlighted.passage.text = 'Первый стих Второй стих\n\nТретий стих';
  highlighted.passage.verses = [
    { number: 8, text: 'Первый стих', paragraph_start: true },
    { number: 9, text: 'Второй стих', paragraph_start: false },
    { number: 10, text: 'Третий стих', paragraph_start: true },
  ];
  highlighted.highlight = {
    canonical: { book_number: 19, chapter_number: 4, verse_start: 8, verse_end: 8 },
    passage: { chapter_number: 22, verse_start: 9, verse_end: 10 },
  };

  const parsed = parseScriptureSelection(highlighted);
  assert.deepEqual(parsed, highlighted);
  const segments = buildScriptureTextSegments(parsed);
  assert.equal(
    segments.map((segment) => segment.prefix + segment.text).join(''),
    highlighted.passage.text,
  );
  assert.deepEqual(
    segments.filter((segment) => segment.highlighted).map((segment) => segment.number),
    [9, 10],
  );
});

test('compact card text keeps only the highlighted verses', () => {
  const highlighted = structuredClone(selection);
  highlighted.passage.text = 'Первый стих Второй стих\n\nТретий стих';
  highlighted.passage.verses = [
    { number: 8, text: 'Первый стих', paragraph_start: true },
    { number: 9, text: 'Второй стих', paragraph_start: false },
    { number: 10, text: 'Третий стих', paragraph_start: true },
  ];
  highlighted.highlight = {
    canonical: { book_number: 19, chapter_number: 4, verse_start: 8, verse_end: 8 },
    passage: { chapter_number: 22, verse_start: 9, verse_end: 9 },
  };

  const compact = buildScriptureCompactText(toScriptureDisplay(highlighted, { 19: 'Псалом' }));
  assert.deepEqual(compact, {
    text: 'Второй стих',
    highlightedNumbers: [9],
    partial: true,
  });
});

test('compact card text falls back to the whole passage without a usable highlight', () => {
  const plain = toScriptureDisplay(selection, { 19: 'Псалом' });
  assert.deepEqual(buildScriptureCompactText(plain), {
    text: selection.passage.text,
    highlightedNumbers: [],
    partial: false,
  });

  const wholePassage = structuredClone(selection);
  wholePassage.passage.text = 'Первый стих Второй стих';
  wholePassage.passage.verses = [
    { number: 1, text: 'Первый стих', paragraph_start: true },
    { number: 2, text: 'Второй стих', paragraph_start: false },
  ];
  wholePassage.highlight = {
    canonical: { book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 2 },
    passage: { chapter_number: 22, verse_start: 1, verse_end: 2 },
  };
  const compact = buildScriptureCompactText(toScriptureDisplay(wholePassage, { 19: 'Псалом' }));
  assert.equal(compact.text, wholePassage.passage.text);
  assert.equal(compact.partial, false);
  assert.deepEqual(compact.highlightedNumbers, [1, 2]);
});

test('verse rendering falls back to passage text when verses are absent or inconsistent', () => {
  assert.equal(buildScriptureTextSegments(selection), null);

  const highlightWithoutVerses = structuredClone(selection);
  highlightWithoutVerses.highlight = {
    canonical: { book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 1 },
    passage: { chapter_number: 22, verse_start: 1, verse_end: 1 },
  };
  assert.equal(buildScriptureTextSegments(highlightWithoutVerses), null);

  const inconsistent = structuredClone(selection);
  inconsistent.passage.verses = [
    { number: 1, text: 'Другой текст', paragraph_start: true },
  ];
  inconsistent.highlight = {
    canonical: { book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 1 },
    passage: { chapter_number: 22, verse_start: 1, verse_end: 1 },
  };
  assert.equal(buildScriptureTextSegments(inconsistent), null);
});

test('structured verses render without highlight and ranges tolerate numbering gaps', () => {
  const versesOnly = structuredClone(selection);
  versesOnly.passage.text = 'Восьмой стих Десятый стих';
  versesOnly.passage.verses = [
    { number: 8, text: 'Восьмой стих', paragraph_start: true },
    { number: 10, text: 'Десятый стих', paragraph_start: false },
  ];
  assert.deepEqual(
    buildScriptureTextSegments(versesOnly).map((segment) => segment.highlighted),
    [false, false],
  );

  versesOnly.highlight = {
    canonical: { book_number: 19, chapter_number: 23, verse_start: 9, verse_end: 9 },
    passage: { chapter_number: 22, verse_start: 9, verse_end: 10 },
  };
  assert.deepEqual(
    buildScriptureTextSegments(versesOnly)
      .filter((segment) => segment.highlighted)
      .map((segment) => segment.number),
    [10],
  );
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
  assert.equal(
    parseScriptureSelection({ ...selection, passage: { ...selection.passage, verses: [] } }),
    null,
  );
  assert.equal(parseScriptureSelection({ ...selection, highlight: null }), null);
});
