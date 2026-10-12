import assert from 'node:assert/strict';
import test from 'node:test';
import { keepShortPrepositions } from '../questionTypography.ts';

test('a one-letter Russian or Ukrainian preposition stays with its word', () => {
  assert.equal(keepShortPrepositions('Что я вижу в этом?'), 'Что я вижу в\u00a0этом?');
  assert.equal(keepShortPrepositions('Іди з миром і вірою'), 'Іди з\u00a0миром і\u00a0вірою');
});

test('other words and spacing remain unchanged', () => {
  assert.equal(keepShortPrepositions('Свет в сердце, на пути'), 'Свет в\u00a0сердце, на пути');
  assert.equal(keepShortPrepositions('Два  слова'), 'Два  слова');
});
