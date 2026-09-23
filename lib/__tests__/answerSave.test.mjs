import assert from 'node:assert/strict';
import test from 'node:test';

import { saveAnswerDraft } from '../answerSave.ts';

async function fixture(changes = {}) {
  const calls = [];
  await saveAnswerDraft(
    {
      mode: 'manual',
      hasAnswerContext: true,
      coreAiConsent: 'allowed',
      answerContextConsent: 'undecided',
      prayerEnded: false,
      ...changes,
    },
    async () => { calls.push('persist'); },
    () => calls.push('ask'),
  );
  return calls;
}

test('auto-save before reflection keeps a typed answer with an unanswered consent', async () => {
  assert.deepEqual(await fixture({ mode: 'auto' }), ['persist']);
});

test('manual save stores the answer before asking the undecided answer consent', async () => {
  assert.deepEqual(await fixture(), ['persist', 'ask']);
});

test('manual save after the prayer ended does not open a consent the reflection would unmount', async () => {
  assert.deepEqual(await fixture({ prayerEnded: true }), ['persist']);
});

test('a failed local save propagates and never asks the consent', async () => {
  const failure = new Error('SQLITE_FULL');
  const calls = [];
  await assert.rejects(
    saveAnswerDraft(
      {
        mode: 'manual',
        hasAnswerContext: true,
        coreAiConsent: 'allowed',
        answerContextConsent: 'undecided',
        prayerEnded: false,
      },
      async () => { throw failure; },
      () => calls.push('ask'),
    ),
    failure,
  );
  assert.deepEqual(calls, []);
});

test('manual save asks nothing once the answer consent is decided', async () => {
  assert.deepEqual(await fixture({ answerContextConsent: 'allowed' }), ['persist']);
  assert.deepEqual(await fixture({ answerContextConsent: 'denied' }), ['persist']);
});

test('manual save asks nothing when no answer can reach a request', async () => {
  assert.deepEqual(await fixture({ hasAnswerContext: false }), ['persist']);
  assert.deepEqual(await fixture({ coreAiConsent: 'undecided' }), ['persist']);
  assert.deepEqual(await fixture({ coreAiConsent: 'denied' }), ['persist']);
});
