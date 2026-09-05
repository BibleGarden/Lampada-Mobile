import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { buildQuestionRequest } from '../questionRequest.ts';

const answer = (text, transcripts = []) => ({
  text, recordings: transcripts.map((transcript) => ({ transcript })),
});
const questions = ['How do you feel?', 'Skipped question?', 'What changed?', 'Unanswered?'];
const answers = {
  2: answer(' I feel calmer. ', [null, ' First recording. ', 'Second recording.']),
  0: answer('I do not want to live.'),
  1: answer('  ', [null, ' ']),
};

test('history preserves question associations, conversation order and complete voice turns', () => {
  const request = buildQuestionRequest('next', ' Family ', questions, answers);
  assert.deepEqual(request, { stage: 'next', topic: 'Family', messages: [
    { role: 'assistant', text: questions[0] },
    { role: 'user', text: answers[0].text },
    { role: 'assistant', text: questions[2] },
    { role: 'user', text: 'I feel calmer.\nFirst recording.\nSecond recording.' },
  ] });
  assert.deepEqual(buildQuestionRequest('first', 'Family', questions, answers).messages, []);
  assert.deepEqual(buildQuestionRequest('next', '', questions, {}).messages, []);
  assert.deepEqual(buildQuestionRequest('reflect', '', questions, { 0: answer('', ['Voice']) }).messages,
    [{ role: 'assistant', text: questions[0] }, { role: 'user', text: 'Voice' }]);
});

test('context retains newest messages within both limits without mutating or truncating the latest reply', () => {
  const manyQuestions = Array.from({ length: 30 }, (_, i) => `Question ${i}?`);
  const manyAnswers = Object.fromEntries(manyQuestions.map((_, i) => [i, answer(`Answer ${i}`)]));
  const request = buildQuestionRequest('next', 'Topic', manyQuestions, manyAnswers);
  assert.equal(request.messages.length, 40);
  assert.equal(request.messages[0].text, 'Question 10?');
  assert.equal(request.messages.at(-1).text, 'Answer 29');
  assert.equal(Object.keys(manyAnswers).length, 30);
  const full = buildQuestionRequest('next', 'Topic', ['Old?', 'New?'], {
    0: answer('x'.repeat(16_000)), 1: answer('y'.repeat(15_991)),
  });
  assert.deepEqual(full.messages.map((m) => m.text), ['New?', 'y'.repeat(15_991)]);
  assert.equal(full.topic.length + full.messages.reduce((n, m) => n + m.text.length, 0), 16_000);
  const single = buildQuestionRequest('next', '', ['Question?'], { 0: answer('z'.repeat(16_000)) });
  assert.deepEqual(single.messages, [{ role: 'user', text: 'z'.repeat(16_000) }]);
  assert.throws(() => buildQuestionRequest('next', 'Topic', ['New?'], {
    0: answer('x'.repeat(16_000)),
  }), /latest reply exceeds/);
  assert.throws(() => buildQuestionRequest('first', 'x'.repeat(16_001)), /topic exceeds/);
});

const settingsUrl = `data:text/javascript,${encodeURIComponent(`
  let core = true;
  let answers = true;
  export const coreAiAllowedNow = () => core;
  export const answerContextAllowedNow = () => answers;
  export const setConsent = (c, a) => { core = c; answers = a; };
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './settings' && /\/(ai|llm)\.ts$/.test(context.parentURL ?? '')) {
      return { url: settingsUrl, shortCircuit: true };
    }
    if (['./llm', './questionRequest'].includes(specifier) && /\/(ai|llm)\.ts$/.test(context.parentURL ?? '')) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

test('all prayer stages send structured messages and respect consent withdrawal', async () => {
  process.env.EXPO_PUBLIC_AI_PROXY_URL = 'https://proxy.test/api/ai/question';
  const { generateFirstQuestion, generateQuestion, generateReflectQuestion } = await import('../ai.ts');
  const { completePrayerContent } = await import('../llm.ts');
  const { setConsent } = await import(settingsUrl);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ text: 'What would help you today?' }) };
  };
  try {
    await generateFirstQuestion(' Family ');
    assert.deepEqual(requests.at(-1), { stage: 'first', topic: 'Family', messages: [] });
    await generateFirstQuestion(' ');
    assert.deepEqual(requests.at(-1), { stage: 'first', topic: '', messages: [] });
    await generateQuestion('Family', questions, answers);
    assert.deepEqual(requests.at(-1), buildQuestionRequest('next', 'Family', questions, answers));
    assert.equal(requests.at(-1).messages[1].text, 'I do not want to live.');
    assert.match(requests.at(-1).messages.at(-1).text, /^I feel calmer/);
    const renewed = { ...answers, 3: answer('I do not want to live.') };
    await generateQuestion('Family', questions, renewed);
    assert.equal(requests.at(-1).messages.at(-1).text, 'I do not want to live.');
    await generateReflectQuestion('Family', questions, answers);
    assert.deepEqual(requests.at(-1), buildQuestionRequest('reflect', 'Family', questions, answers));
    const privateRequest = requests.at(-1);
    setConsent(true, false);
    await generateQuestion('Family', questions, {});
    assert.deepEqual(requests.at(-1).messages, []);
    const count = requests.length;
    await assert.rejects(completePrayerContent(privateRequest), /Answer context/);
    setConsent(false, true);
    await assert.rejects(completePrayerContent({ stage: 'first', topic: 'Private', messages: [] }), /Core prayer/);
    assert.equal((await generateFirstQuestion('Private')).source, 'fallback');
    assert.equal(requests.length, count);
    assert.ok(requests.every((r) => !('user' in r) && !('last_user_message' in r)));
  } finally {
    globalThis.fetch = originalFetch;
    hooks.deregister();
  }
});
