import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
// Фейковые SQLite и файловая система: строки записей лежат в state.recordings,
// существующие файлы — в state.files, сбой проверки — в state.unreadable.
const stateUrl = data(`
  export const state = { recordings: [], files: new Set(), unreadable: new Set(), diagnostics: [] };
`);
const mocks = {
  'expo-sqlite': data(`
    import { state } from '${stateUrl}';
    export const openDatabaseAsync = async () => ({
      execAsync: async () => {},
      getFirstAsync: async () => null,
      getAllAsync: async (sql) => (sql.includes('FROM recordings WHERE session_id') ? state.recordings : []),
      runAsync: async () => {},
    });
  `),
  'expo-file-system': data(`
    import { state } from '${stateUrl}';
    export const Paths = { document: { uri: 'file:///doc/' } };
    export class File {
      constructor(base, name) { this.uri = name ? base.uri + name : base; }
      get exists() {
        if (state.unreadable.has(this.uri)) throw new Error('invalid URI');
        return state.files.has(this.uri);
      }
      write(line) { state.diagnostics.push(JSON.parse(line)); }
      delete() {}
    }
  `),
  './scriptureSchema': data('export const migrateScriptureStorage = async () => {};'),
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/db.ts')) {
      if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
      if (specifier.startsWith('./')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const db = await import('../db.ts');
const { state } = await import(stateUrl);

const row = (id, name) => ({
  id,
  question_index: 0,
  uri: `lampada-document:Audio/${name}`,
  duration_sec: 7,
  transcript: ` transcript ${id} `,
});

test('journal detail marks recordings without audio and keeps their transcripts', async () => {
  state.recordings = [row(1, 'kept.m4a'), row(2, 'restored.m4a'), row(3, 'broken.m4a')];
  state.files = new Set(['file:///doc/Audio/kept.m4a']);
  state.unreadable = new Set(['file:///doc/Audio/broken.m4a']);
  state.diagnostics.length = 0;

  const { recordings } = await db.getJournalDetail(1);

  assert.deepEqual(
    recordings.map(({ id, uri, transcript, audioAvailable }) => ({ id, uri, transcript, audioAvailable })),
    [
      { id: 1, uri: 'file:///doc/Audio/kept.m4a', transcript: 'transcript 1', audioAvailable: true },
      { id: 2, uri: 'file:///doc/Audio/restored.m4a', transcript: 'transcript 2', audioAvailable: false },
      { id: 3, uri: 'file:///doc/Audio/broken.m4a', transcript: 'transcript 3', audioAvailable: false },
    ],
  );
  assert.deepEqual(
    state.diagnostics.map(({ event, recordingId, reason }) => ({ event, recordingId, reason })),
    [
      { event: 'recording_audio_missing', recordingId: 2, reason: 'missing' },
      { event: 'recording_audio_missing', recordingId: 3, reason: 'unreadable' },
    ],
  );
});
