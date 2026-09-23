import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { buildQuestionRequest, limitQuestionRequest } from '../questionRequest.ts';

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
  assert.deepEqual(limitQuestionRequest({ ...request, default_language: 'uk' }), {
    ...request, default_language: 'uk',
  });
});

const settingsUrl = `data:text/javascript,${encodeURIComponent(`
  let core = true;
  let answers = true;
  let uiLanguage = 'en';
  export const useSettings = {
    getState: () => ({ uiLanguage, scripturePreferences: { language: 'uk' }, prayerMinutes: 10, setPrayerMinutes: async () => {} }),
  };
  export const setUiLanguage = (value) => { uiLanguage = value; };
  export const ensureSettingsLoaded = async () => {};
  export const scripturePreferencesNow = () => ({ language: 'uk' });
  export const coreAiAllowedNow = () => core;
  export const answerContextAllowedNow = () => answers;
  export const setConsent = (c, a) => { core = c; answers = a; };
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './settings' && /\/(ai|llm|store)\.ts$/.test(context.parentURL ?? '')) {
      return { url: settingsUrl, shortCircuit: true };
    }
    if (context.parentURL?.endsWith('/store.ts')) {
      const mocks = {
        './db': 'export const saveAnswer = async () => {}; export const replaceRecordings = async () => {}; export const createSession = async () => 1;',
        './scriptureRepository': 'export const getFavoriteScriptures = async () => []; export const getScriptureHistory = async () => [];',
        './scriptureClient': 'export const fetchScriptureBooks = () => {}; export const selectScripture = async () => ({ ok: false, error: { kind: "cancelled" } }); export const selectScriptureOnce = async () => ({ ok: false, error: { kind: "prefetch_denied" } });',
        './prayerSystemTimer': 'export const startPrayerSystemTimer = async () => {}; export const stopPrayerSystemTimer = async () => {}; export const updatePrayerSystemTimer = async () => {};',
      };
      if (specifier in mocks) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
      if (specifier.startsWith('./')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    if (['./llm', './questionRequest', './locales/fallbackQuestions'].includes(specifier) && /\/(ai|llm)\.ts$/.test(context.parentURL ?? '')) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

test('all prayer stages send structured messages and respect consent withdrawal', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
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
    assert.deepEqual(requests.at(-1), { stage: 'first', topic: 'Family', messages: [], default_language: 'en' });
    await generateFirstQuestion(' ');
    assert.deepEqual(requests.at(-1), { stage: 'first', topic: '', messages: [], default_language: 'en' });
    await generateQuestion('Family', questions, answers);
    assert.deepEqual(requests.at(-1), { ...buildQuestionRequest('next', 'Family', questions, answers), default_language: 'en' });
    assert.equal(requests.at(-1).messages[1].text, 'I do not want to live.');
    assert.match(requests.at(-1).messages.at(-1).text, /^I feel calmer/);
    const renewed = { ...answers, 3: answer('I do not want to live.') };
    await generateQuestion('Family', questions, renewed);
    assert.equal(requests.at(-1).messages.at(-1).text, 'I do not want to live.');
    await generateReflectQuestion('Family', questions, answers);
    assert.deepEqual(requests.at(-1), { ...buildQuestionRequest('reflect', 'Family', questions, answers), default_language: 'en' });
    const privateRequest = requests.at(-1);
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ text: 'What would help you today?', novel: false }) };
    };
    const repeated = await generateQuestion('Family', questions, answers, ['Replaced question?']);
    assert.equal(repeated.novel, false);
    assert.deepEqual(requests.at(-1).skipped_questions, ['Replaced question?']);
    assert.equal((await generateReflectQuestion('Family', questions, answers)).source, 'fallback');
    assert.equal((await generateFirstQuestion('Family')).source, 'fallback');
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    try {
      for (const detail of ['prefetch_disabled', 'prefetch_limit_exceeded']) {
        globalThis.fetch = async (_url, options) => {
          requests.push(JSON.parse(options.body));
          return { ok: false, status: 429, json: async () => ({ detail }) };
        };
        const before = requests.length;
        assert.equal(await generateFirstQuestion('Family', true), null);
        assert.equal(await generateQuestion('Family', questions, answers, [], true), null);
        assert.equal(await generateReflectQuestion('Family', questions, answers, [], true), null);
        assert.equal(requests.length, before + 3);
        assert.ok(requests.slice(before).every((request) => request.prefetch === true));
        assert.ok(requests.slice(before).every((request) => request.default_language === 'en'));
      }
      assert.deepEqual(warnings, []);
      globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ detail: 'Rate limit exceeded' }) });
      assert.equal(await generateQuestion('Family', questions, answers, [], true), null);
    } finally {
      console.warn = originalWarn;
    }
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ text: 'What would help you today?' }) };
    };
    await generateQuestion('Family', questions, answers);
    assert.equal(requests.at(-1).prefetch, undefined);
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
    setConsent(true, true);
    globalThis.fetch = originalFetch;
  }
});

test('prayer requests follow the current interface language independently of Scripture and prayer text', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  const { generateFirstQuestion, generateQuestion, generateReflectQuestion } = await import('../ai.ts');
  const { setUiLanguage } = await import(settingsUrl);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ text: 'What would help you today?' }) };
  };
  try {
    for (const language of ['ru', 'uk', 'en']) {
      setUiLanguage(language);
      for (const topic of ['', '...', 'Я хочу помолитися за свою родину.']) {
        await generateFirstQuestion(topic);
        assert.deepEqual(requests.at(-1), { stage: 'first', topic, messages: [], default_language: language });
      }
      const reply = 'Я вдячна за підтримку моєї родини.';
      await generateQuestion('...', ['Як ви почуваєтесь?'], { 0: answer(reply) });
      assert.equal(requests.at(-1).default_language, language);
      assert.equal(requests.at(-1).messages.at(-1).text, reply);
      await generateReflectQuestion('', [], {});
      assert.deepEqual(requests.at(-1), { stage: 'reflect', topic: '', messages: [], default_language: language });
    }
  } finally {
    setUiLanguage('en');
    globalThis.fetch = originalFetch;
  }
});

test('session first, replace, next and reflect requests use UI language and discard prefetches from another language', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  const { useSession } = await import('../store.ts');
  const { setUiLanguage } = await import(settingsUrl);
  const originalFetch = globalThis.fetch;
  const requests = [];
  const settle = () => new Promise(setImmediate);
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ text: `Generated question ${requests.length}?`, novel: true }) };
  };
  try {
    setUiLanguage('ru');
    useSession.getState().reset();
    useSession.getState().setTopic('');
    useSession.getState().prepareThreshold();
    await settle();
    assert.deepEqual(requests, [{ stage: 'first', topic: '', messages: [], default_language: 'ru', prefetch: true }]);
    useSession.setState({ sessionId: 1 });
    const first = useSession.getState().questions[0];
    await useSession.getState().nextQuestion();
    await settle();
    assert.equal(requests[1].stage, 'next');
    assert.equal(requests[1].prefetch, undefined);
    assert.equal(requests.at(-1).prefetch, true);
    assert.deepEqual(requests[1].skipped_questions, [first]);
    assert.deepEqual(useSession.getState().skippedQuestions, [first]);
    assert.ok(requests.every((request) => request.default_language === 'ru'));

    const beforeSwitch = requests.length;
    setUiLanguage('uk');
    await useSession.getState().nextQuestion();
    await settle();
    assert.ok(requests.length > beforeSwitch);
    assert.ok(requests.slice(beforeSwitch).every((request) => request.default_language === 'uk'));
    assert.equal(useSession.getState().questions[0], `Generated question ${beforeSwitch + 1}?`);

    const reply = 'Я вдячна за підтримку моєї родини.';
    await useSession.getState().saveAnswer(0, reply, []);
    await useSession.getState().nextQuestion();
    await settle();
    assert.equal(useSession.getState().qIndex, 1);
    assert.equal(requests.at(-1).messages.at(-1).text, reply);
    assert.equal(requests.at(-1).default_language, 'uk');

    useSession.getState().prepareReflect();
    await settle();
    assert.equal(requests.at(-1).stage, 'reflect');
    assert.equal(requests.at(-1).default_language, 'uk');
    assert.equal(requests.at(-1).prefetch, true);
    setUiLanguage('en');
    const beforeReflection = requests.length;
    await useSession.getState().finish();
    assert.equal(requests.length, beforeReflection + 1);
    assert.equal(requests.at(-1).stage, 'reflect');
    assert.equal(requests.at(-1).default_language, 'en');
    assert.equal(requests.at(-1).prefetch, undefined);
    assert.equal(useSession.getState().reflectQ, `Generated question ${requests.length}?`);
  } finally {
    useSession.getState().reset();
    setUiLanguage('en');
    globalThis.fetch = originalFetch;
  }
});

test('real session and transport recover from both prefetch denials without dropping the interface language', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  const { useSession } = await import('../store.ts');
  const { setUiLanguage } = await import(settingsUrl);
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  const settle = () => new Promise(setImmediate);
  console.warn = (...args) => warnings.push(args);
  try {
    for (const detail of ['prefetch_disabled', 'prefetch_limit_exceeded']) {
      const requests = [];
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        requests.push(request);
        return request.prefetch
          ? { ok: false, status: 429, json: async () => ({ detail }) }
          : { ok: true, json: async () => ({ text: `Demand ${request.stage} question?`, novel: true }) };
      };
      setUiLanguage('ru');
      useSession.getState().reset();
      useSession.getState().setTopic('');
      const initialQuestions = useSession.getState().questions;
      useSession.getState().prepareThreshold();
      await settle();
      assert.deepEqual(useSession.getState().questions, initialQuestions);
      assert.deepEqual(requests, [{ stage: 'first', topic: '', messages: [], prefetch: true, default_language: 'ru' }]);

      await useSession.getState().enterSession();
      await settle();
      assert.equal(useSession.getState().questions[0], 'Demand first question?');
      assert.equal(useSession.getState().generating, false);
      const afterEntry = requests.length;
      await settle();
      assert.equal(requests.length, afterEntry);

      await useSession.getState().nextQuestion();
      await settle();
      assert.deepEqual(useSession.getState().skippedQuestions, ['Demand first question?']);
      await useSession.getState().saveAnswer(0, 'Моя відповідь.', []);
      await useSession.getState().nextQuestion();
      await settle();
      assert.equal(useSession.getState().qIndex, 1);

      useSession.getState().prepareReflect();
      await settle();
      const afterWarmup = requests.length;
      useSession.getState().prepareReflect();
      await settle();
      assert.equal(requests.length, afterWarmup);
      await useSession.getState().finish();
      assert.equal(useSession.getState().reflectQ, 'Demand reflect question?');
      const demand = requests.filter((request) => !request.prefetch);
      assert.deepEqual(demand.map((request) => request.stage), ['first', 'next', 'next', 'reflect']);
      assert.ok(demand.every((request) => !Object.hasOwn(request, 'prefetch')));
      assert.ok(requests.every((request) => request.default_language === 'ru'));
      assert.equal(demand.at(-1).messages.at(-1).text, 'Моя відповідь.');
      assert.ok(useSession.getState().questionSources.every((source) => source === 'ai'));
      assert.equal(useSession.getState().reflectSource, 'ai');
    }
    assert.deepEqual(warnings, []);
  } finally {
    useSession.getState().reset();
    setUiLanguage('en');
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test.after(() => hooks.deregister());
