import assert from 'node:assert/strict';
import test from 'node:test';
import { withContinuationEllipsis, withoutPunctuationAtClippedLine } from '../textTruncation.ts';

test('continuation ellipsis removes terminal punctuation and whitespace', () => {
  assert.equal(withContinuationEllipsis('к тебе.  '), 'к тебе …');
  assert.equal(withContinuationEllipsis('к тебе!'), 'к тебе …');
  assert.equal(withContinuationEllipsis('к тебе'), 'к тебе …');
});

test('clipped line drops only its terminal punctuation', () => {
  const passage = 'Сын мой! Наставления мои храни. Да будут они с тобой.';
  assert.equal(
    withoutPunctuationAtClippedLine(passage, 'Наставления мои храни.'),
    'Сын мой! Наставления мои храни Да будут они с тобой.',
  );
  assert.equal(withoutPunctuationAtClippedLine(passage, 'Сын мой'), passage);
  assert.equal(withoutPunctuationAtClippedLine('Да. Да. Далее', 'Да.'), 'Да. Да. Далее');
});
