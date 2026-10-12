import assert from 'node:assert/strict';
import test from 'node:test';
import { withContinuationEllipsis, collapsedTextFromLines, shortenCollapsedText } from '../textTruncation.ts';

test('continuation ellipsis removes terminal punctuation and whitespace', () => {
  assert.equal(withContinuationEllipsis('к тебе.  '), 'к тебе …');
  assert.equal(withContinuationEllipsis('к тебе!'), 'к тебе …');
  assert.equal(withContinuationEllipsis('к тебе,;: '), 'к тебе …');
  assert.equal(withContinuationEllipsis('к тебе'), 'к тебе …');
});

test('collapsed text uses measured lines and trims terminal punctuation', () => {
  const lines = ['Сын мой! ', 'Наставления мои храни. ', 'Да будут они ', 'с тобой,;:!?… ', 'Дальше'];
  assert.equal(collapsedTextFromLines(lines, 4), 'Сын мой! Наставления мои храни. Да будут они с тобой…');
  assert.equal(collapsedTextFromLines(lines, 2), 'Сын мой! Наставления мои храни…');
});

test('session preview replaces a sentence-final dot with one manual ellipsis', () => {
  const measuredLines = ['И Я ', 'избрал Тебя. ', 'Следующий стих'];
  assert.equal(collapsedTextFromLines(measuredLines, 2), 'И Я избрал Тебя…');
  assert.equal(shortenCollapsedText(collapsedTextFromLines(measuredLines, 2)), 'И Я избрал Теб…');
  assert.equal(withContinuationEllipsis('И Я избрал Тебя.'), 'И Я избрал Тебя …');
});

test('collapsed text preserves words split by layout and explicit newlines', () => {
  const lines = ['Сверхдлин', 'ное слово\n', 'Следующая строка.'];
  assert.equal(collapsedTextFromLines(lines, 2), 'Сверхдлинное слово…');
  assert.equal(collapsedTextFromLines(lines, 3), 'Сверхдлинное слово\nСледующая строка…');
});

test('each fitting step changes the candidate after trailing punctuation and spaces', () => {
  const first = collapsedTextFromLines(['к тебе.   '], 1);
  const second = shortenCollapsedText(first);
  const third = shortenCollapsedText(second);
  assert.equal(first, 'к тебе…');
  assert.equal(second, 'к теб…');
  assert.equal(third, 'к те…');
  assert.ok(first.length > second.length && second.length > third.length);
});

test('fitting removes one Unicode code point without splitting surrogate pairs', () => {
  assert.equal(shortenCollapsedText('мир🙂…'), 'мир…');
  assert.equal(shortenCollapsedText(collapsedTextFromLines(['слово, '], 1)), 'слов…');
});
