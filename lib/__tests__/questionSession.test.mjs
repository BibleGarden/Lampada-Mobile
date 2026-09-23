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
  export const generateFirstQuestion = generateQuestion;
`);
const settingsUrl = data(`
  export const answerContextAllowedNow = () => true;
  export const coreAiAllowedNow = () => true;
  export const ensureSettingsLoaded = async () => {};
  export const scripturePreferencesNow = () => ({ language: 'ru', translationCode: 1, voiceCode: 1 });
  export const useSettings = { getState: () => ({ uiLanguage: 'en', prayerMinutes: 10, setPrayerMinutes: async () => {} }) };
`);
const scriptureUrl = data(`
  export const requests = [];
  export const fetchScriptureBooks = async () => [];
  export const selectScripture = (request) => new Promise(resolve => requests.push({ request, resolve }));
  export const selectScriptureOnce = selectScripture;
`);
const mocks = {
  './ai': aiUrl,
  './settings': settingsUrl,
  './db': data('export const saveAnswer = async () => { if (globalThis.failAnswerSave) throw new Error(\'SQLITE_FULL\'); }; export const createSession = async () => 1;'),
  './scriptureRepository': data(`
    export const getFavoriteScriptures = async () => [];
    export const getScriptureHistory = async () => [];
    export const getScriptureBookNames = async () => ({ 19: 'Psalm' });
    export const cacheScripture = async () => {};
    export const recordScriptureShown = async () => {};
    export const getShownScriptureCache = async () => { throw new Error('Prefetch must not use offline fallback'); };
  `),
  './scriptureClient': scriptureUrl,
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
const { requests: scriptureRequests } = await import(scriptureUrl);
const start = () => {
  useSession.getState().reset();
  requests.length = 0;
  scriptureRequests.length = 0;
  useSession.setState({ sessionId: 1, questions: ['Initial question?'], questionSources: ['ai'] });
};
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

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
  await useSession.getState().saveAnswer(0, 'My answer', []);
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
  await useSession.getState().saveAnswer(0, 'My answer', []);
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

test('question denial stays silent and pending demand switches to an ordinary request', async () => {
  start();
  await useSession.getState().saveAnswer(0, 'My answer', []);
  assert.equal(requests[0].args[4], true);
  const pending = useSession.getState().nextQuestion();
  requests[0].resolve(null);
  await settle();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].args[4], false);
  assert.equal(useSession.getState().questions.length, 1);
  requests[1].resolve({ text: 'Demand question?', source: 'ai' });
  await pending;
  assert.equal(useSession.getState().questions[1], 'Demand question?');
  assert.equal(requests[2].args[4], true);
  requests[2].resolve(null);
  await settle();
  assert.equal(requests.length, 3);
});

test('reflection denial is memoized across timer ticks and demand while pending is ordinary', async () => {
  start();
  useSession.setState({ startedAtMs: 0, endsAtMs: 20_000 });
  useSession.getState().tick(10_000);
  assert.equal(requests[0].args[4], true);
  requests[0].resolve(null);
  await settle();
  useSession.getState().tick(11_000);
  useSession.getState().prepareReflect();
  assert.equal(requests.length, 1);
  const pending = useSession.getState().finish();
  assert.equal(requests[1].args[4], false);
  requests[1].resolve({ text: 'Reflect on today?', source: 'ai' });
  await pending;
  assert.equal(useSession.getState().reflectQ, 'Reflect on today?');

  start();
  useSession.getState().prepareReflect();
  const waiting = useSession.getState().finish();
  requests[0].resolve(null);
  await settle();
  assert.equal(requests[1].args[4], false);
  requests[1].resolve({ text: 'Reflect after waiting?', source: 'ai' });
  await waiting;
  assert.equal(useSession.getState().reflectQ, 'Reflect after waiting?');
});

test('first question and hidden initial scripture are prefetch; demand after their denial is ordinary', async () => {
  start();
  useSession.getState().reset();
  useSession.getState().prepareThreshold();
  assert.equal(requests[0].args[1], true);
  await useSession.getState().enterSession();
  await settle();
  assert.equal(scriptureRequests[0].request.prefetch, true);
  requests[0].resolve(null);
  scriptureRequests[0].resolve({ ok: false, error: { kind: 'prefetch_denied' } });
  await settle();
  assert.equal(requests[1].args[1], undefined);
  assert.equal(scriptureRequests.length, 1);
  assert.equal(useSession.getState().scrStatus, 'idle');
  assert.equal(useSession.getState().scrError, null);
  useSession.getState().setDockMode('scripture');
  await settle();
  assert.equal(scriptureRequests[1].request.prefetch, undefined);
  useSession.getState().reset();
  scriptureRequests[1].resolve({ ok: false, error: { kind: 'cancelled' } });
  requests[1].resolve({ text: 'Late question?', source: 'ai' });
  await settle();
});

test('opening scripture during pending initial denial issues one demand request', async () => {
  start();
  await useSession.getState().enterSession();
  await settle();
  useSession.getState().setDockMode('scripture');
  assert.equal(scriptureRequests.length, 1);
  scriptureRequests[0].resolve({ ok: false, error: { kind: 'prefetch_denied' } });
  await settle();
  assert.equal(scriptureRequests.length, 2);
  assert.equal(scriptureRequests[1].request.prefetch, undefined);
  useSession.getState().reset();
  scriptureRequests[1].resolve({ ok: false, error: { kind: 'cancelled' } });
  requests[0].resolve(null);
  await settle();
});

test('next scripture demand waits for denied prefetch and then loads without the marker', async () => {
  start();
  await useSession.getState().enterSession();
  await settle();
  const passage = (id) => ({
    ok: true,
    data: {
      language: 'ru',
      canonical: { canonical_id: id, book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 1 },
      passage: { translation: 1, translation_alias: 'syn', book_number: 19, chapter_number: 22, verse_start: 1, verse_end: 1, title: null, text: 'The Lord is my shepherd.' },
      source: 'ai', history_reset: false,
    },
  });
  scriptureRequests[0].resolve(passage('v3:19.023.001-001'));
  await settle();
  assert.equal(scriptureRequests[1].request.prefetch, true);
  const pending = useSession.getState().nextScripture();
  scriptureRequests[1].resolve({ ok: false, error: { kind: 'prefetch_denied' } });
  await settle();
  assert.equal(scriptureRequests.length, 3);
  assert.equal(scriptureRequests[2].request.prefetch, undefined);
  scriptureRequests[2].resolve(passage('v3:19.023.002-002'));
  await pending;
  await settle();
  assert.equal(useSession.getState().scrList.length, 2);
  assert.equal(useSession.getState().scrError, null);
  assert.equal(scriptureRequests[3].request.prefetch, true);
  scriptureRequests[3].resolve({ ok: false, error: { kind: 'prefetch_denied' } });
  await settle();
  assert.equal(scriptureRequests.length, 4);
  useSession.getState().reset();
  requests[0].resolve(null);
  await settle();
});

test.after(() => hooks.deregister());

test('a failed SQLite answer write rejects and leaves the in-memory answer and prefetch untouched', async () => {
  start();
  globalThis.failAnswerSave = true;
  try {
    await assert.rejects(useSession.getState().saveAnswer(0, 'Lost answer', []), /SQLITE_FULL/);
  } finally {
    globalThis.failAnswerSave = false;
  }
  assert.deepEqual(useSession.getState().answers, {});
  assert.equal(requests.length, 0);
});
