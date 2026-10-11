import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { create } from 'zustand';
import * as timer from '../sessionTimer.ts';
import * as pool from '../oneAheadPool.ts';
import * as singleFlight from '../singleFlight.ts';
import * as prayerDuration from '../prayerDuration.ts';
import * as questionNovelty from '../questionNovelty.ts';
import * as scriptureSessionState from '../scriptureSessionState.ts';

class ScriptureCatalogUnavailableError extends Error {}
class ScriptureDefaultUnavailableError extends Error {}

// Ждём наблюдаемое условие, а не фиксированное число микротасков.
const waitFor = async (condition, message) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
};

// Run the real store with native/network boundaries replaced by local doubles.
const source = ts.transpileModule(readFileSync(new URL('../store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const timers = [];
  const finished = [];
  const checkpoints = [];
  const checkpointSave = { error: null };
  const savedStreak = { count: 1, prayedToday: true, week: [] };
  const createdSessions = [];
  // Двойник meta.prayer_minutes: что последним сохранила начатая молитва.
  const rememberedMinutes = [];
  const prayerMinutesSave = { error: null };
  const scriptureInitialization = { error: null, calls: 0, saved: null };
  // Подбор отрывка по умолчанию не завершается; тест каталога включает ответ.
  const scriptureLoad = { history: null, historyError: null, requests: [] };
  const favoriteSave = { error: null, writes: [] };
  const diagnostics = [];
  let resolveReflection;
  const dependencies = {
    zustand: { create },
    './ai': {
      getCuratedQuestions: () => ['Initial question'],
      generateFirstQuestion: () => new Promise(() => {}),
      generateReflectQuestion: () => new Promise((resolve) => { resolveReflection = resolve; }),
    },
    './db': {
      createSession: async (...args) => {
        createdSessions.push(args);
        return 43;
      },
      finishSession: async (...args) => finished.push(args),
      recordDiagnostic: (event) => diagnostics.push(event),
      errorKind: (error) => (error instanceof Error ? 'error' : typeof error),
      saveElapsedCheckpoint: async (...args) => {
        checkpoints.push(args);
        if (checkpointSave.error) throw checkpointSave.error;
      },
      getStreak: async () => savedStreak,
    },
    './settings': {
      ScriptureCatalogUnavailableError,
      ScriptureDefaultUnavailableError,
      answerContextAllowedNow: () => true,
      coreAiAllowedNow: () => true,
      ensureSettingsLoaded: async () => {},
      ensureScripturePreferences: async () => {
        scriptureInitialization.calls++;
        if (scriptureInitialization.error) throw scriptureInitialization.error;
        return { preferences: { language: 'en', translationCode: 16, voiceCode: 151 }, languages: null, translations: null };
      },
      useSettings: {
        getState: () => ({
          uiLanguage: 'en',
          scripturePreferences: scriptureInitialization.saved,
          prayerMinutes: rememberedMinutes.at(-1) ?? prayerDuration.DEFAULT_PRAYER_MINUTES,
          setPrayerMinutes: async (minutes) => {
            if (prayerMinutesSave.error) throw prayerMinutesSave.error;
            prayerDuration.serializePrayerMinutes(minutes);
            rememberedMinutes.push(minutes);
          },
        }),
      },
    },
    './oneAheadPool': pool,
    './singleFlight': singleFlight,
    './sessionTimer': timer,
    './prayerDuration': prayerDuration,
    './questionNovelty': questionNovelty,
    './prayerSystemTimer': {
      startPrayerSystemTimer: async (value) => timers.push(value),
      stopPrayerSystemTimer: async () => timers.push(null),
      updatePrayerSystemTimer: async (value) => timers.push(value),
    },
    './answerContext': { replyTexts: () => [] },
    './scripture': { buildScriptureRequest: (request) => request },
    './scriptureClient': {
      selectScripture: async (request) => {
        scriptureLoad.requests.push(request);
        return { ok: false, error: { kind: 'unavailable', status: 503 } };
      },
    },
    './scriptureRepository': {
      getFavoriteScriptures: async () => [],
      getScriptureHistory: () => (scriptureLoad.historyError
        ? Promise.reject(scriptureLoad.historyError)
        : scriptureLoad.history ?? new Promise(() => {})),
      getShownScriptureCache: async () => [],
      addFavoriteScripture: async (display) => {
        favoriteSave.writes.push(['add', display.canonicalId]);
        if (favoriteSave.error) throw favoriteSave.error;
      },
      removeFavoriteByCanonicalId: async (canonicalId) => {
        favoriteSave.writes.push(['remove', canonicalId]);
        if (favoriteSave.error) throw favoriteSave.error;
      },
    },
    './scriptureSessionState': scriptureSessionState,
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
    shownQuestions: ['First question', 'Previous reflection', 'Second question'],
    skippedQuestions: ['Skipped question'], qIndex: 1, answeredCount: 1,
    answers: { 0: { text: 'Saved answer', recordings: [{ id: 7, uri: 'file:///test.m4a', durationSec: 2, transcript: 'Transcript' }] } },
    scrList: [{ canonicalId: 'first' }, { canonicalId: 'second' }], scrIndex: 1,
    scrFav: ['first'], scrStatus: 'ready', dockMode: 'scripture',
  });
  return {
    store, timers, finished, checkpoints, checkpointSave, savedStreak, createdSessions, rememberedMinutes, prayerMinutesSave, scriptureInitialization,
    scriptureLoad, favoriteSave, diagnostics, resolveReflection: (value) => resolveReflection(value),
  };
}

test('return from timeout retains the same session, answers, recordings and scripture trail', async () => {
  const { store, timers, finished } = fixture();
  const before = store.getState();
  const now = Date.now();
  before.resumeSession();
  const after = store.getState();
  for (const key of ['sessionId', 'topic', 'questions', 'questionSources', 'shownQuestions', 'skippedQuestions',
    'qIndex', 'answeredCount', 'answers', 'scrList', 'scrIndex', 'scrFav', 'scrStatus',
    'scriptureSelection', 'dockMode', 'startedAtMs']) {
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

// День молитвы по sessions.started_at отмечает сама база (journalDays.test.mjs).
test('completion saves the session and shows the streak read back from the database', async () => {
  const { store, finished, savedStreak } = fixture();
  await store.getState().complete('Takeaway');
  assert.deepEqual(finished, [[42, 300, 'Takeaway']]);
  assert.equal(store.getState().streak, savedStreak);
});

test('completion without an active session fails without saving', async () => {
  const { store, finished } = fixture();
  store.setState({ sessionId: null, startedAtMs: null });
  await assert.rejects(store.getState().complete(''), /No active prayer session/);
  assert.deepEqual(finished, []);
});

const runningUntimed = (store) => {
  const startedAtMs = Date.now();
  store.setState({ sessionId: 43, minutes: 0, startedAtMs, endsAtMs: null, remaining: null, elapsed: 0 });
  return startedAtMs;
};

test('a running prayer saves its time once a minute, not on every tick', () => {
  const { store, checkpoints } = fixture();
  const startedAtMs = runningUntimed(store);
  for (const second of [1, 30, 59]) store.getState().tick(startedAtMs + second * 1_000);
  assert.deepEqual(checkpoints, []);
  for (const second of [60, 61, 119, 120, 150]) store.getState().tick(startedAtMs + second * 1_000);
  assert.deepEqual(checkpoints, [[43, 60], [43, 120]]);
});

test('leaving the app saves the exact time, but not before the first minute', () => {
  const { store, checkpoints } = fixture();
  const startedAtMs = runningUntimed(store);
  store.getState().tick(startedAtMs + 30_000);
  store.getState().checkpointElapsed();
  assert.deepEqual(checkpoints, []);
  store.getState().tick(startedAtMs + 75_000);
  store.getState().checkpointElapsed();
  store.getState().tick(startedAtMs + 100_000);
  store.getState().checkpointElapsed();
  store.getState().checkpointElapsed();
  assert.deepEqual(checkpoints, [[43, 75], [43, 100]]);
});

test('finishing saves the time before reflection, and a resumed prayer keeps adding to it', async () => {
  const { store, checkpoints, finished, resolveReflection } = fixture();
  const pending = store.getState().finish();
  assert.deepEqual(checkpoints, [[42, 300]]);
  store.getState().resumeSession();
  const { endsAtMs } = store.getState();
  store.getState().tick(endsAtMs - 30_000);
  const { elapsed } = store.getState();
  assert.ok(elapsed >= 570);
  assert.deepEqual(checkpoints, [[42, 300], [42, elapsed]]);
  await store.getState().complete('');
  assert.equal(finished[0][1], elapsed);
  resolveReflection(null);
  await pending;
});

test('a new prayer starts its checkpoints from zero even when its id was used before', async () => {
  const { store, checkpoints } = fixture();
  store.setState({ sessionId: 43, elapsed: 600 });
  store.getState().checkpointElapsed();
  // После стирания данных база снова выдаёт id 43.
  store.setState({ sessionId: null, startedAtMs: null });
  await store.getState().enterSession();
  const { startedAtMs } = store.getState();
  store.getState().tick(startedAtMs + 60_000);
  assert.deepEqual(checkpoints, [[43, 600], [43, 60]]);
});

test('a failed checkpoint is recorded and the next minute tries again', async () => {
  const { store, checkpoints, checkpointSave, diagnostics } = fixture();
  const startedAtMs = runningUntimed(store);
  checkpointSave.error = new Error('SQLITE_FULL');
  store.getState().tick(startedAtMs + 60_000);
  await waitFor(() => diagnostics.includes('elapsed_checkpoint_failed'), 'checkpoint failure was not recorded');
  checkpointSave.error = null;
  store.getState().tick(startedAtMs + 120_000);
  assert.deepEqual(checkpoints, [[43, 60], [43, 120]]);
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

test('the journal row stores the start moment that dates the prayer day', async () => {
  const { store, createdSessions } = fixture();
  store.setState({ sessionId: null, startedAtMs: null });
  await store.getState().enterSession();
  const { sessionId, startedAtMs } = store.getState();
  assert.equal(sessionId, 43);
  assert.deepEqual(createdSessions, [['Test intention', 5, startedAtMs]]);
});

test('setup opens with the default duration until a prayer has been started', () => {
  const { store } = fixture();
  store.getState().reset();
  assert.equal(store.getState().minutes, prayerDuration.DEFAULT_PRAYER_MINUTES);
});

test('a started prayer remembers its stepper duration for the next setup', async () => {
  const { store, rememberedMinutes } = fixture();
  store.setState({ sessionId: null, startedAtMs: null, minutes: 35 });
  await store.getState().enterSession();
  assert.deepEqual(rememberedMinutes, [35]);
  store.getState().reset();
  assert.equal(store.getState().minutes, 35);
});

test('an untimed prayer is remembered as untimed', async () => {
  const { store, rememberedMinutes } = fixture();
  store.setState({ sessionId: null, startedAtMs: null, minutes: 0 });
  await store.getState().enterSession();
  store.getState().reset();
  assert.deepEqual(rememberedMinutes, [0]);
  assert.equal(store.getState().minutes, 0);
});

test('a duration chosen on setup without starting the prayer is not remembered', () => {
  const { store, rememberedMinutes } = fixture();
  store.getState().setMinutes(60);
  store.getState().reset();
  assert.deepEqual(rememberedMinutes, []);
  assert.equal(store.getState().minutes, prayerDuration.DEFAULT_PRAYER_MINUTES);
});

test('extending and resuming a prayer keep the duration chosen at its start', async () => {
  const { store, rememberedMinutes } = fixture();
  store.setState({ sessionId: null, startedAtMs: null, minutes: 15 });
  await store.getState().enterSession();
  store.getState().adjustTimer(5);
  assert.equal(store.getState().minutes, 20);
  store.getState().resumeSession();
  store.getState().reset();
  assert.deepEqual(rememberedMinutes, [15]);
  assert.equal(store.getState().minutes, 15);
});

test('a failed duration save leaves no journal entry, so a retry creates exactly one', async () => {
  const { store, createdSessions, rememberedMinutes, prayerMinutesSave } = fixture();
  store.setState({ sessionId: null, startedAtMs: null, minutes: 15 });
  prayerMinutesSave.error = new Error('meta write failed');
  await assert.rejects(store.getState().enterSession(), /meta write failed/);
  assert.deepEqual(createdSessions, []);
  assert.equal(store.getState().sessionId, null);
  prayerMinutesSave.error = null;
  await store.getState().enterSession();
  assert.equal(createdSessions.length, 1);
  assert.deepEqual(rememberedMinutes, [15]);
});

test('a saved Bible selection is frozen on entry without initialization', async () => {
  const { store, scriptureInitialization } = fixture();
  store.getState().reset();
  scriptureInitialization.saved = { language: 'ru', translationCode: 1, voiceCode: 1 };
  await store.getState().enterSession();
  assert.deepEqual(store.getState().scriptureSelection, { language: 'ru', translation: 1, voice: 1 });
  assert.equal(scriptureInitialization.calls, 0);
});

test('first launch offline: the prayer starts, the scripture block shows catalog_unavailable, Retry confirms the Bible in the same session', async () => {
  const { store, createdSessions, scriptureInitialization, scriptureLoad } = fixture();
  store.getState().reset();
  scriptureInitialization.error = new ScriptureCatalogUnavailableError('offline');
  await store.getState().enterSession();
  assert.equal(createdSessions.length, 1);
  assert.equal(store.getState().sessionId, 43);
  assert.equal(store.getState().scriptureSelection, null);
  // Скрытая попытка на входе ничего не показывает, пока блок закрыт.
  await waitFor(() => store.getState().scrStatus === 'idle', 'the hidden entry attempt did not settle');
  assert.equal(store.getState().scrError, null);
  store.getState().setDockMode('scripture');
  await waitFor(() => store.getState().scrStatus === 'error', 'opening the block did not show the error');
  assert.equal(store.getState().scrError, 'catalog_unavailable');
  assert.equal(store.getState().scrList.length, 0);
  assert.equal(store.getState().scriptureSelection, null);
  const callsBeforeRetry = scriptureInitialization.calls;
  scriptureInitialization.error = null;
  scriptureLoad.history = Promise.resolve([]);
  await store.getState().retryScripture();
  assert.equal(scriptureInitialization.calls, callsBeforeRetry + 1);
  assert.equal(store.getState().sessionId, 43);
  assert.deepEqual(store.getState().scriptureSelection, { language: 'en', translation: 16, voice: 151 });
  // Подбор пошёл с подтверждённой тройкой; его собственная ошибка уже не про каталог.
  assert.equal(scriptureLoad.requests.length, 1);
  assert.equal(scriptureLoad.requests[0].language, 'en');
  assert.equal(scriptureLoad.requests[0].translation, 16);
  assert.equal(store.getState().scrStatus, 'error');
  assert.equal(store.getState().scrError, 'unavailable');
});

test('a catalog without a Bible for the interface language sends the block to Settings, not to a retry', async () => {
  const { store, scriptureInitialization, diagnostics } = fixture();
  store.getState().reset();
  scriptureInitialization.error = new ScriptureDefaultUnavailableError('no voiced translation');
  await store.getState().enterSession();
  store.getState().setDockMode('scripture');
  await waitFor(() => store.getState().scrStatus === 'error', 'the block did not show the error');
  assert.equal(store.getState().scrError, 'no_default_bible');
  assert.deepEqual(diagnostics, []);
});

test('a local storage failure while confirming the Bible is reported as itself and logged', async () => {
  const { store, scriptureInitialization, diagnostics } = fixture();
  store.getState().reset();
  scriptureInitialization.error = new Error('SQLITE_FULL');
  await store.getState().enterSession();
  store.getState().setDockMode('scripture');
  await waitFor(() => store.getState().scrStatus === 'error', 'the block did not show the error');
  assert.equal(store.getState().scrError, 'selection_failed');
  assert.ok(diagnostics.includes('scripture_selection_failed'));
});

test('a local failure while loading Scripture ends in a visible error with a diagnostic, not an endless loading state', async () => {
  const { store, scriptureLoad, diagnostics } = fixture();
  store.getState().reset();
  scriptureLoad.historyError = new Error('SQLITE_IOERR');
  await store.getState().enterSession();
  // Скрытая попытка на входе не показывает ошибку, но оставляет след.
  await waitFor(() => store.getState().scrStatus === 'idle', 'the hidden entry attempt stayed in loading');
  assert.equal(store.getState().scrError, null);
  assert.deepEqual(diagnostics, ['scripture_load_failed']);
  store.getState().setDockMode('scripture');
  await waitFor(() => store.getState().scrStatus === 'error', 'opening the block stayed in loading');
  assert.equal(store.getState().scrError, 'unavailable');
  assert.deepEqual(diagnostics, ['scripture_load_failed', 'scripture_load_failed']);
  scriptureLoad.historyError = null;
  scriptureLoad.history = Promise.resolve([]);
  await store.getState().retryScripture();
  assert.equal(scriptureLoad.requests.length, 1);
});

test('a failed favourite write rolls the heart back and is reported', async () => {
  const { store, favoriteSave, diagnostics } = fixture();
  favoriteSave.error = new Error('SQLITE_FULL');
  store.getState().toggleFav();
  assert.deepEqual(store.getState().scrFav, ['first', 'second']);
  await waitFor(() => store.getState().scrFav.length === 1, 'the failed add was not rolled back');
  assert.deepEqual(store.getState().scrFav, ['first']);
  assert.deepEqual(favoriteSave.writes, [['add', 'second']]);
  assert.deepEqual(diagnostics, ['favorite_save_failed']);
});

test('a favourite toggled again before the failure settles is not rolled back over the newer choice', async () => {
  const { store, favoriteSave, diagnostics } = fixture();
  favoriteSave.error = new Error('SQLITE_FULL');
  store.getState().toggleFav();
  favoriteSave.error = null;
  store.getState().toggleFav();
  await waitFor(() => diagnostics.length === 1, 'the failed add was not reported');
  assert.deepEqual(store.getState().scrFav, ['first']);
});
