import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const aiUrl = data(`
  export const requests = [];
  export const getCuratedQuestions = () => ['Initial question?'];
  export const pickFallbackQuestion = () => 'Fresh fallback question?';
  export const generateQuestion = (...args) => new Promise(resolve => requests.push({ args, resolve }));
  export const generateReflectQuestion = generateQuestion;
`);
const settingsUrl = data(`
  export const answerContextAllowedNow = () => true;
  export const coreAiAllowedNow = () => true;
  export const ensureSettingsLoaded = async () => {};
  export const scripturePreferencesNow = () => ({});
  export const useSettings = { getState: () => ({ uiLanguage: 'en' }) };
`);
const mocks = {
  './ai': aiUrl,
  './settings': settingsUrl,
  './db': data('export const saveAnswer = async () => {}; export const replaceRecordings = async () => {};'),
  './scriptureRepository': data(''),
  './scriptureClient': data('export const fetchScriptureBooks = () => {}; export const selectScripture = () => {}; export const selectScriptureOnce = () => {};'),
  './prayerSystemTimer': data('export const startPrayerSystemTimer = async () => {}; export const stopPrayerSystemTimer = async () => {}; export const updatePrayerSystemTimer = async () => {};'),
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/store.ts')) {
      if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
      if (specifier.startsWith('./')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { useSession } = await import('../store.ts');
const { requests } = await import(aiUrl);
const start = () => {
  useSession.getState().reset();
  requests.length = 0;
  useSession.setState({ sessionId: 1, questions: ['Initial question?'], questionSources: ['ai'] });
};
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('rapid replacement waits once, archives only displayed questions, and prefetch includes the current question', async () => {
  start();
  const pending = useSession.getState().nextQuestion();
  await useSession.getState().nextQuestion();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].args[3], ['Initial question?']);
  requests[0].resolve({ text: 'Second question?', source: 'ai', novel: true });
  await pending;
  assert.deepEqual(useSession.getState().skippedQuestions, ['Initial question?']);
  assert.deepEqual(requests[1].args[3], ['Initial question?', 'Second question?']);
  requests[1].resolve({ text: 'Third question?', source: 'ai' });
  await settle();
  await useSession.getState().nextQuestion();
  assert.deepEqual(useSession.getState().skippedQuestions, ['Initial question?', 'Second question?']);
  useSession.getState().saveAnswer(0, 'My answer', []);
  assert.deepEqual(requests.at(-1).args[3], ['Initial question?', 'Second question?']);
  useSession.getState().reset();
  assert.deepEqual(useSession.getState().skippedQuestions, []);
});

test('novel false keeps the current question and allows an explicit retry without background looping', async () => {
  start();
  const pending = useSession.getState().nextQuestion();
  requests[0].resolve({ text: 'Initial question?', source: 'ai', novel: false });
  await pending;
  assert.deepEqual(useSession.getState().questions, ['Initial question?']);
  assert.deepEqual(useSession.getState().skippedQuestions, []);
  assert.equal(useSession.getState().generating, false);
  assert.equal(requests.length, 1);
  const retry = useSession.getState().nextQuestion();
  assert.equal(requests.length, 2);
  requests[1].resolve({ text: 'Different question?', source: 'ai', novel: true });
  await retry;
  assert.equal(useSession.getState().questions[0], 'Different question?');
});

test('novel false after an answer advances with a fallback and does not mark the answered question as skipped', async () => {
  start();
  useSession.getState().saveAnswer(0, 'My answer', []);
  const pending = useSession.getState().nextQuestion();
  assert.deepEqual(requests[0].args[3], []);
  requests[0].resolve({ text: 'Initial question?', source: 'ai', novel: false });
  await pending;
  assert.equal(useSession.getState().qIndex, 1);
  assert.equal(useSession.getState().questions[1], 'Fresh fallback question?');
  assert.deepEqual(useSession.getState().skippedQuestions, []);
});

test('a response from a reset prayer cannot replace a question or restore skipped history', async () => {
  start();
  const pending = useSession.getState().nextQuestion();
  useSession.getState().reset();
  requests[0].resolve({ text: 'Late question?', source: 'ai', novel: true });
  await pending;
  assert.deepEqual(useSession.getState().questions, ['Initial question?']);
  assert.deepEqual(useSession.getState().skippedQuestions, []);
  assert.equal(useSession.getState().generating, false);
});

test.after(() => hooks.deregister());
