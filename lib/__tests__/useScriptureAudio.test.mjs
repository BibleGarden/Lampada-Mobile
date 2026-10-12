import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { ScriptureAudioUnavailableError } from '../scriptureAudioClient.ts';
import * as operation from '../scriptureAudioOperation.ts';
import { hasSessionActivity, scheduleSessionCompletion } from '../sessionCompletion.ts';

const source = ts.transpileModule(readFileSync(new URL('../useScriptureAudio.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(failure) {
  const slots = [];
  let cursor = 0;
  let changed = false;
  const effects = new Map();
  let pendingEffects = [];
  let requests = 0;
  let acquisitions = 0;
  const busy = [];
  const diagnostics = [];
  const player = { pause() {}, play() { assert.fail('Unavailable narration must not play'); } };
  const runtime = {
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { changed ||= !Object.is(slots[index], value); slots[index] = value; }];
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) {
        slots[index] = { value: callback, dependencies };
      }
      return slots[index].value;
    },
    useMemo(compute, dependencies) { return runtime.useCallback(compute, dependencies)(); },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = effects.get(index);
      if (!previous || dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effects.set(index, { dependencies, cleanup: effect() });
        });
      }
    },
  };
  const dependencies = {
    react: runtime,
    'expo-audio': { useAudioPlayer: () => player, useAudioPlayerStatus: () => ({}) },
    './scriptureAudioClient': { ScriptureAudioUnavailableError, fetchScriptureAudioClip: async () => { requests++; throw failure; } },
    './audioModeCoordinator': { TRANSIENT_AUDIO_PLAYER_OPTIONS: {} },
    './audioSession': { audioModeCoordinator: { acquireSession: () => { acquisitions++; } } },
    './scriptureAudioOperation': operation,
    './nativePlaybackStart': {},
    './db': {
      errorKind: () => 'Error',
      recordDiagnostic: (event, details) => diagnostics.push({ event, details }),
    },
  };
  const exports = {};
  new Function('require', 'exports', source)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  const scripture = { canonicalId: 'isa40', receivedAt: 1, selection: { passage: {
    translation: 1, book_number: 23, chapter_number: 40, verse_start: 28, verse_end: 31,
    text: 'Private passage text',
  } } };
  const inputs = { scripture, voice: 1, enabled: true,
    onAudioBusyChange: value => busy.push(value) };
  return {
    diagnostics, busy, scripture,
    render(changes = {}) {
      Object.assign(inputs, changes);
      let result;
      do {
        changed = false;
        cursor = 0;
        pendingEffects = [];
        result = exports.useScriptureAudio(inputs);
        for (const effect of pendingEffects) effect();
      } while (changed);
      return result;
    },
    requests: () => requests,
    acquisitions: () => acquisitions,
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('unavailable narration clears loading, records identifiers and releases the prayer deadline', async (t) => {
  const f = fixture(new ScriptureAudioUnavailableError('no_timings'));
  f.render().toggle();
  assert.equal(f.render().phase, 'loading');
  await settle();
  const audio = f.render();
  assert.equal(audio.phase, 'unavailable');
  assert.deepEqual(f.busy, [true, false]);
  assert.equal(f.acquisitions(), 0);
  assert.equal(audio.activeVerseNumber, null);
  assert.deepEqual(f.diagnostics, [{ event: 'scripture_audio_unavailable', details: {
    cause: 'no_timings', translation: '1', voice: '1', book: '23', chapter: '40',
  } }]);
  audio.toggle();
  assert.equal(f.requests(), 1);

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const finish = t.mock.fn();
  const cancel = scheduleSessionCompletion({ timeExpired: true, screenVisible: true,
    activityOpen: hasSessionActivity({ readerOpen: false, answerOpen: false,
      reportOpen: false, scriptureAudioPhase: audio.phase }) }, finish);
  t.after(cancel);
  t.mock.timers.tick(999);
  assert.equal(finish.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.equal(finish.mock.callCount(), 1);
});

test('malformed narration remains a reported, retryable error', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const f = fixture(new Error('invalid_response'));
  f.render().toggle();
  await settle();
  assert.equal(f.render().phase, 'error');
  assert.deepEqual(f.busy, [true, false]);
  assert.deepEqual(f.diagnostics, [{ event: 'scripture_audio_failed', details: {
    reason: 'play_failed', errorKind: 'Error', code: 'invalid_response',
  } }]);
});

for (const context of ['canonicalId', 'voice', 'enabled']) {
  test(`unavailable resets on ${context} change and permits a fresh request`, async () => {
    const f = fixture(new ScriptureAudioUnavailableError('no_timings'));
    f.render().toggle();
    await settle();
    assert.equal(f.render().phase, 'unavailable');
    const change = context === 'canonicalId'
      ? { scripture: { ...f.scripture, canonicalId: 'new-passage' } }
      : context === 'voice' ? { voice: 2 } : { enabled: false };
    assert.equal(f.render(change).phase, 'idle');
    if (context === 'enabled') assert.equal(f.render({ enabled: true }).phase, 'idle');
    f.render().toggle();
    assert.equal(f.render().phase, 'loading');
    await settle();
    assert.equal(f.requests(), 2);
    assert.equal(f.render().phase, 'unavailable');
  });
}
