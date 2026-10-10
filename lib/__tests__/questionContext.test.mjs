import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { buildQuestionRequest, limitQuestionRequest } from '../questionRequest.ts';
import { fallbackQuestions } from '../locales/fallbackQuestions.ts';

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
  const request = buildQuestionRequest('next', ' Family ', questions, answers, [], answers);
  assert.deepEqual(request, { stage: 'next', topic: 'Family', messages: [
    { role: 'assistant', text: questions[0] },
    { role: 'user', text: answers[0].text },
    { role: 'assistant', text: questions[2] },
    { role: 'user', text: 'I feel calmer.\nFirst recording.\nSecond recording.' },
  ], shown_questions: [questions[1]] });
  assert.deepEqual(buildQuestionRequest('first', 'Family', questions, answers, [], answers).messages, []);
  assert.equal(buildQuestionRequest('first', 'Family', questions, answers, [], answers).shown_questions, undefined);
  assert.deepEqual(buildQuestionRequest('next', '', questions, {}, [], {}).messages, []);
  assert.deepEqual(buildQuestionRequest('reflect', '', questions, { 0: answer('', ['Voice']) }, [], { 0: answer('', ['Voice']) }).messages,
    [{ role: 'assistant', text: questions[0] }, { role: 'user', text: 'Voice' }]);
});

test('untranscribed voice answers are sent as shown questions, including without answer consent', () => {
  const actualAnswers = { 0: answer('', [null]), 1: answer('Private answer') };
  const voiceRequest = buildQuestionRequest('next', 'Topic', ['Voice?', 'Text?'], actualAnswers, [], actualAnswers);
  assert.deepEqual(voiceRequest.shown_questions, ['Voice?']);
  assert.deepEqual(voiceRequest.messages.map((message) => message.text), ['Text?', 'Private answer']);

  const privateRequest = buildQuestionRequest('reflect', 'Topic', ['Voice?', 'Text?', 'Current?'], {},
    ['Current?'], actualAnswers);
  assert.deepEqual(privateRequest.messages, []);
  assert.deepEqual(privateRequest.shown_questions, ['Voice?', 'Text?']);
  assert.deepEqual(privateRequest.skipped_questions, ['Current?']);
  assert.equal(buildQuestionRequest('first', 'Topic', ['Voice?'], {}, [], actualAnswers).shown_questions, undefined);
  assert.equal(limitQuestionRequest({ stage: 'first', topic: 'Topic', messages: [],
    shown_questions: ['Voice?'] }).shown_questions, undefined);
});

test('a question displaced from skipped history remains in shown history after it is answered', () => {
  const skipped = ['Previously skipped?', ...Array.from({ length: 10 }, (_, index) => `Later ${index}?`)];
  const actualAnswers = { 0: answer('', [null]) };
  const request = buildQuestionRequest('next', 'Topic', ['Previously skipped?'], {}, skipped, actualAnswers);
  assert.deepEqual(request.skipped_questions, skipped.slice(1));
  assert.deepEqual(request.shown_questions, ['Previously skipped?']);

  const stillSkipped = buildQuestionRequest('next', 'Topic', ['Previously skipped?'], {},
    ['Previously skipped?'], actualAnswers);
  assert.deepEqual(stillSkipped.skipped_questions, ['Previously skipped?']);
  assert.equal(stillSkipped.shown_questions, undefined);

  const longQuestion = 'x'.repeat(350);
  const cappedSkip = buildQuestionRequest('next', 'Topic', [longQuestion], {},
    [longQuestion], actualAnswers);
  assert.deepEqual(cappedSkip.skipped_questions, [longQuestion.slice(0, 300)]);
  assert.equal(cappedSkip.shown_questions, undefined);
});

test('shown questions retain the latest ten, respect the 300-character cap and the shared budget', () => {
  const questions = Array.from({ length: 13 }, (_, index) => `${index}: ${'x'.repeat(400)}`);
  const actualAnswers = Object.fromEntries(questions.map((_, index) => [index, answer('', [null])]));
  const request = buildQuestionRequest('next', '', questions, actualAnswers, [], actualAnswers);
  assert.deepEqual(request.shown_questions, questions.slice(-10).map((question) => question.slice(0, 300)));
  assert.deepEqual(limitQuestionRequest(request), request);

  const budget = buildQuestionRequest('next', 'Topic', ['Answered?', 'Old?', 'New?'],
    { 0: answer('x'.repeat(15_981)) }, [],
    { 0: answer('x'.repeat(15_981)), 1: answer('', [null]), 2: answer('', [null]) });
  assert.deepEqual(budget.shown_questions, ['New?']);
  assert.ok(budget.topic.length + budget.messages.reduce((sum, message) => sum + message.text.length, 0)
    + budget.shown_questions.reduce((sum, question) => sum + question.length, 0) <= 16_000);
});

test('context retains newest messages within both limits without mutating or truncating the latest reply', () => {
  const manyQuestions = Array.from({ length: 30 }, (_, i) => `Question ${i}?`);
  const manyAnswers = Object.fromEntries(manyQuestions.map((_, i) => [i, answer(`Answer ${i}`)]));
  const request = buildQuestionRequest('next', 'Topic', manyQuestions, manyAnswers, [], manyAnswers);
  assert.equal(request.messages.length, 40);
  assert.equal(request.messages[0].text, 'Question 10?');
  assert.equal(request.messages.at(-1).text, 'Answer 29');
  assert.deepEqual(request.shown_questions, manyQuestions.slice(0, 10));
  assert.equal(Object.keys(manyAnswers).length, 30);
  const full = buildQuestionRequest('next', 'Topic', ['Old?', 'New?'], {
    0: answer('x'.repeat(16_000)), 1: answer('y'.repeat(15_991)),
  }, [], { 0: answer('x'.repeat(16_000)), 1: answer('y'.repeat(15_991)) });
  assert.deepEqual(full.messages.map((m) => m.text), ['New?', 'y'.repeat(15_991)]);
  assert.equal(full.topic.length + full.messages.reduce((n, m) => n + m.text.length, 0), 16_000);
  const single = buildQuestionRequest('next', '', ['Question?'], { 0: answer('z'.repeat(16_000)) }, [],
    { 0: answer('z'.repeat(16_000)) });
  assert.deepEqual(single.messages, [{ role: 'user', text: 'z'.repeat(16_000) }]);
  assert.throws(() => buildQuestionRequest('next', 'Topic', ['New?'], {
    0: answer('x'.repeat(16_000)),
  }, [], { 0: answer('x'.repeat(16_000)) }), /latest reply exceeds/);
  assert.throws(() => buildQuestionRequest('first', 'x'.repeat(16_001), [], {}, [], {}), /topic exceeds/);
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
  export class ScriptureCatalogUnavailableError extends Error {}
  export class ScriptureDefaultUnavailableError extends Error {}
  export const ensureScripturePreferences = async () => ({ preferences: { language: 'uk' }, languages: null, translations: null });
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
        './db': 'export const saveAnswer = async () => {}; export const createSession = async () => 1;',
        './scriptureRepository': 'export const getFavoriteScriptures = async () => []; export const getScriptureHistory = async () => [];',
        './scriptureClient': 'export const fetchScriptureBooks = () => {}; export const selectScripture = async () => ({ ok: false, error: { kind: "cancelled" } }); export const selectScriptureOnce = async () => ({ ok: false, error: { kind: "prefetch_denied" } });',
        './prayerSystemTimer': 'export const startPrayerSystemTimer = async () => {}; export const stopPrayerSystemTimer = async () => {}; export const updatePrayerSystemTimer = async () => {};',
      };
      if (specifier in mocks) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
      if (specifier.startsWith('./')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    if (['./llm', './questionRequest', './questionNovelty', './locales/fallbackQuestions'].includes(specifier) && /\/(ai|llm)\.ts$/.test(context.parentURL ?? '')) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

test('local question pools use unseen candidates before the least recently shown repeat', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  const { hasUnseenFallbackQuestion, pickFallbackQuestion } = await import('../ai.ts');
  const { setUiLanguage } = await import(settingsUrl);
  setUiLanguage('en');
  try {
    for (const stage of ['next', 'reflect']) {
      const pool = fallbackQuestions.en[stage];
      assert.equal(pickFallbackQuestion(pool.slice(1), stage), pool[0]);
      assert.equal(hasUnseenFallbackQuestion(pool.slice(1), stage), true);
      assert.equal(pickFallbackQuestion([...pool.slice(1), pool[0]], stage), pool[1]);
      assert.equal(hasUnseenFallbackQuestion([...pool.slice(1), pool[0]], stage), false);
    }
  } finally {
    setUiLanguage('en');
  }
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
    await generateQuestion('Family', questions, answers, [], false, answers);
    assert.deepEqual(requests.at(-1), { ...buildQuestionRequest('next', 'Family', questions, answers, [], answers), default_language: 'en' });
    assert.equal(requests.at(-1).messages[1].text, 'I do not want to live.');
    assert.match(requests.at(-1).messages.at(-1).text, /^I feel calmer/);
    const renewed = { ...answers, 3: answer('I do not want to live.') };
    await generateQuestion('Family', questions, renewed, [], false, renewed);
    assert.equal(requests.at(-1).messages.at(-1).text, 'I do not want to live.');
    await generateReflectQuestion('Family', questions, answers, [], false, answers);
    assert.deepEqual(requests.at(-1), { ...buildQuestionRequest('reflect', 'Family', questions, answers, [], answers), default_language: 'en' });
    const privateRequest = requests.at(-1);
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ text: 'What would help you today?', novel: false }) };
    };
    const repeated = await generateQuestion('Family', questions, answers, ['Replaced question?'], false, answers);
    assert.equal(repeated.novel, false);
    assert.deepEqual(requests.at(-1).skipped_questions, ['Replaced question?']);
    assert.equal((await generateReflectQuestion('Family', questions, answers, [], false, answers)).source, 'fallback');
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
        assert.equal(await generateQuestion('Family', questions, answers, [], true, answers), null);
        assert.equal(await generateReflectQuestion('Family', questions, answers, [], true, answers), null);
        assert.equal(requests.length, before + 3);
        assert.ok(requests.slice(before).every((request) => request.prefetch === true));
        assert.ok(requests.slice(before).every((request) => request.default_language === 'en'));
      }
      assert.deepEqual(warnings, []);
      globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ detail: 'Rate limit exceeded' }) });
      assert.equal(await generateQuestion('Family', questions, answers, [], true, answers), null);
    } finally {
      console.warn = originalWarn;
    }
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ text: 'What would help you today?' }) };
    };
    await generateQuestion('Family', questions, answers, [], false, answers);
    assert.equal(requests.at(-1).prefetch, undefined);
    setConsent(true, false);
    await generateQuestion('Family', questions, {}, ['Unanswered?'], false, answers);
    assert.deepEqual(requests.at(-1).messages, []);
    assert.deepEqual(requests.at(-1).shown_questions, [questions[0], questions[1], questions[2]]);
    assert.deepEqual(requests.at(-1).skipped_questions, ['Unanswered?']);
    assert.equal(requests.at(-1).default_language, 'en');
    await generateReflectQuestion('Family', questions, {}, ['Unanswered?'], false, answers);
    assert.deepEqual(requests.at(-1).shown_questions, [questions[0], questions[1], questions[2]]);
    assert.equal(requests.at(-1).default_language, 'en');
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
      await generateQuestion('...', ['Як ви почуваєтесь?'], { 0: answer(reply) }, [], false, { 0: answer(reply) });
      assert.equal(requests.at(-1).default_language, language);
      assert.equal(requests.at(-1).messages.at(-1).text, reply);
      await generateReflectQuestion('', [], {}, [], false, {});
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

test('finish sends answered questions without answer consent in the reflection request', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://proxy.test';
  const { useSession } = await import('../store.ts');
  const { setConsent } = await import(settingsUrl);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ text: 'What would help you today?', novel: true }) };
  };
  try {
    setConsent(true, false);
    useSession.getState().reset();
    useSession.setState({ sessionId: 1, topic: '...', questions: ['Voice answer?'],
      shownQuestions: ['Voice answer?'], answers: { 0: answer('', [null]) } });
    await useSession.getState().finish();
    assert.deepEqual(requests, [{ stage: 'reflect', topic: '...', messages: [],
      shown_questions: ['Voice answer?'], default_language: 'en' }]);
  } finally {
    useSession.getState().reset();
    setConsent(true, true);
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
      let nextQuestionNumber = 0;
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        requests.push(request);
        return request.prefetch
          ? { ok: false, status: 429, json: async () => ({ detail }) }
          : { ok: true, json: async () => ({
            text: request.stage === 'next'
              ? `Demand next question ${++nextQuestionNumber}?`
              : `Demand ${request.stage} question?`,
            novel: true,
          }) };
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
      assert.equal(useSession.getState().questions[0], 'Demand next question 1?');
      assert.deepEqual(useSession.getState().skippedQuestions, ['Demand first question?']);
      await useSession.getState().saveAnswer(0, 'Моя відповідь.', []);
      await useSession.getState().nextQuestion();
      await settle();
      assert.equal(useSession.getState().qIndex, 1);
      assert.equal(useSession.getState().questions[1], 'Demand next question 2?');

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
