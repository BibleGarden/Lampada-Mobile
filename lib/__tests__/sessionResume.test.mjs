import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { create } from 'zustand';
import * as timer from '../sessionTimer.ts';
import * as pool from '../oneAheadPool.ts';
import * as singleFlight from '../singleFlight.ts';
import * as streak from '../streak.ts';

// Run the real store with native/network boundaries replaced by local doubles.
const source = ts.transpileModule(readFileSync(new URL('../store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const timers = [];
  const finished = [];
  const prayedDays = [];
  let resolveReflection;
  const dependencies = {
    zustand: { create },
    './ai': {
      getCuratedQuestions: () => ['Initial question'],
      generateReflectQuestion: () => new Promise((resolve) => { resolveReflection = resolve; }),
    },
    './db': {
      finishSession: async (...args) => finished.push(args),
      markPrayedDay: async (day) => {
        prayedDays.push(day);
        return { count: 1, prayedToday: true, week: [] };
      },
    },
    './settings': {
      answerContextAllowedNow: () => true,
      coreAiAllowedNow: () => true,
      useSettings: { getState: () => ({ uiLanguage: 'en' }) },
    },
    './oneAheadPool': pool,
    './singleFlight': singleFlight,
    './sessionTimer': timer,
    './streak': streak,
    './prayerSystemTimer': {
      startPrayerSystemTimer: async (value) => timers.push(value),
      stopPrayerSystemTimer: async () => timers.push(null),
      updatePrayerSystemTimer: async (value) => timers.push(value),
    },
    './answerContext': {}, './scripture': {}, './scriptureClient': {},
    './scriptureRepository': {}, './scriptureSessionState': {},
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  const store = module.exports.useSession;
  const now = Date.now();
  store.setState({
    sessionId: 42, topic: 'Test intention', minutes: 5,
    startedAtMs: now - 300_000, endsAtMs: now - 1_000, remaining: 0, elapsed: 300,
    questions: ['First question', 'Second question'], questionSources: ['ai', 'fallback'],
    skippedQuestions: ['Skipped question'], qIndex: 1, answeredCount: 1,
    answers: { 0: { text: 'Saved answer', recordings: [{ id: 7, uri: 'file:///test.m4a', durationSec: 2, transcript: 'Transcript' }] } },
    scrList: [{ canonicalId: 'first' }, { canonicalId: 'second' }], scrIndex: 1,
    scrFav: ['first'], scrStatus: 'ready', dockMode: 'scripture',
  });
  return {
    store, timers, finished, prayedDays, resolveReflection: (value) => resolveReflection(value),
  };
}

test('return from timeout retains the same session, answers, recordings and scripture trail', async () => {
  const { store, timers, finished } = fixture();
  const before = store.getState();
  const now = Date.now();
  before.resumeSession();
  const after = store.getState();
  for (const key of ['sessionId', 'topic', 'questions', 'questionSources', 'skippedQuestions',
    'qIndex', 'answeredCount', 'answers', 'scrList', 'scrIndex', 'scrFav', 'scrStatus',
    'scriptureLanguage', 'scriptureTranslation', 'scriptureVoice', 'dockMode', 'startedAtMs']) {
    assert.equal(after[key], before[key], key);
  }
  assert.equal(after.remaining, 300);
  assert.ok(after.endsAtMs >= now + 300_000);
  assert.ok(after.elapsed >= before.elapsed);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].endsAtMs, after.endsAtMs);
  after.tick(after.endsAtMs - 30_000);
  assert.equal(store.getState().remaining, 30);
  assert.ok(store.getState().elapsed >= 570);
  await store.getState().complete('Final takeaway');
  assert.equal(finished.length, 1);
  assert.equal(finished[0][0], 42);
  assert.ok(finished[0][1] >= 570);
});

test('return after early finish renews the timer without replacing existing history', () => {
  const { store } = fixture();
  store.setState({ remaining: 120, endsAtMs: Date.now() + 120_000 });
  const answers = store.getState().answers;
  store.getState().resumeSession();
  assert.equal(store.getState().remaining, 300);
  assert.equal(store.getState().answers, answers);
});

test('untimed continuation preserves elapsed time and remains untimed', () => {
  const { store, timers } = fixture();
  store.setState({ minutes: 0, remaining: null, endsAtMs: null });
  store.getState().resumeSession();
  assert.equal(store.getState().remaining, null);
  assert.equal(store.getState().endsAtMs, null);
  assert.ok(store.getState().elapsed >= 300);
  assert.deepEqual(timers, [null]);
});

test('late reflection response cannot overwrite resumed session state', async () => {
  const { store, resolveReflection } = fixture();
  const pending = store.getState().finish();
  assert.equal(store.getState().reflectGenerating, true);
  store.getState().resumeSession();
  resolveReflection({ text: 'Late reflection', source: 'ai' });
  await pending;
  assert.equal(store.getState().reflectGenerating, false);
  assert.notEqual(store.getState().reflectQ, 'Late reflection');
  assert.equal(store.getState().answers[0].text, 'Saved answer');
});

test('resume without an active session does not create one or start a timer', () => {
  const { store, timers } = fixture();
  store.setState({ sessionId: null, startedAtMs: null });
  store.getState().resumeSession();
  assert.equal(store.getState().sessionId, null);
  assert.deepEqual(timers, []);
});

test('a prayer confirmed the next morning counts for the day it started', async () => {
  const { store, prayedDays, finished } = fixture();
  const startedAtMs = new Date(2026, 8, 22, 21, 30).getTime();
  store.setState({ startedAtMs, endsAtMs: startedAtMs + 300_000 });
  store.getState().tick(new Date(2026, 8, 23, 8, 0).getTime());
  await store.getState().complete('');
  assert.deepEqual(prayedDays, ['2026-09-22']);
  assert.equal(finished.length, 1);
});

test('a prayer crossing midnight counts for the day it started', async () => {
  const { store, prayedDays } = fixture();
  const startedAtMs = new Date(2026, 8, 22, 23, 55).getTime();
  store.setState({ startedAtMs, endsAtMs: startedAtMs + 600_000 });
  await store.getState().complete('Takeaway');
  assert.deepEqual(prayedDays, ['2026-09-22']);
});

test('completion without an active session fails without marking a day', async () => {
  const { store, prayedDays, finished } = fixture();
  store.setState({ sessionId: null, startedAtMs: null });
  await assert.rejects(store.getState().complete(''), /No active prayer session/);
  assert.deepEqual(prayedDays, []);
  assert.deepEqual(finished, []);
});

test('an expired prayer finished the next day saves the time up to its deadline', async () => {
  const { store, finished } = fixture();
  const startedAtMs = new Date(2026, 8, 22, 21, 30).getTime();
  store.setState({ startedAtMs, endsAtMs: startedAtMs + 300_000, elapsed: 120 });
  store.getState().tick(new Date(2026, 8, 23, 8, 0).getTime());
  await store.getState().complete('');
  assert.equal(finished[0][1], 300);
});

test('an extended prayer saves the time up to the extended deadline', async () => {
  const { store, finished } = fixture();
  const now = Date.now();
  store.setState({ startedAtMs: now - 240_000, endsAtMs: now + 60_000, remaining: 60, elapsed: 240 });
  store.getState().adjustTimer(1);
  const { endsAtMs } = store.getState();
  store.getState().tick(endsAtMs + 3_600_000);
  await store.getState().complete('');
  assert.equal(finished[0][1], Math.floor((endsAtMs - (now - 240_000)) / 1_000));
  assert.ok(finished[0][1] >= 359);
});

test('a resumed prayer counts reflection time and caps at the renewed deadline', async () => {
  const { store, finished } = fixture();
  const { startedAtMs } = store.getState();
  store.getState().resumeSession();
  const { endsAtMs } = store.getState();
  store.getState().tick(endsAtMs + 3_600_000);
  await store.getState().complete('');
  assert.equal(finished[0][1], Math.floor((endsAtMs - startedAtMs) / 1_000));
});
