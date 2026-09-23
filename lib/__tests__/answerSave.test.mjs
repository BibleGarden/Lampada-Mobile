import assert from 'node:assert/strict';
import test from 'node:test';

import { saveAnswerDraft } from '../answerSave.ts';

function fixture(changes = {}) {
  const calls = [];
  saveAnswerDraft(
    {
      mode: 'manual',
      hasAnswerContext: true,
      coreAiConsent: 'allowed',
      answerContextConsent: 'undecided',
      ...changes,
    },
    () => calls.push('persist'),
    () => calls.push('ask'),
  );
  return calls;
}

test('auto-save before reflection keeps a typed answer with an unanswered consent', () => {
  assert.deepEqual(fixture({ mode: 'auto' }), ['persist']);
});

test('manual save stores the answer before asking the undecided answer consent', () => {
  assert.deepEqual(fixture(), ['persist', 'ask']);
});

test('manual save asks nothing once the answer consent is decided', () => {
  assert.deepEqual(fixture({ answerContextConsent: 'allowed' }), ['persist']);
  assert.deepEqual(fixture({ answerContextConsent: 'denied' }), ['persist']);
});

test('manual save asks nothing when no answer can reach a request', () => {
  assert.deepEqual(fixture({ hasAnswerContext: false }), ['persist']);
  assert.deepEqual(fixture({ coreAiConsent: 'undecided' }), ['persist']);
  assert.deepEqual(fixture({ coreAiConsent: 'denied' }), ['persist']);
});
