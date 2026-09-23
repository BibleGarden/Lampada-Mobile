import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
// Фейковая SQLite: откат транзакции отбрасывает все её записи; запросы через
// общее соединение попадают в sharedRows отдельно от транзакции.
const sqliteUrl = data(`
  export const state = { rows: [], sharedRows: [], failRecordingInsert: false };
  export const openDatabaseAsync = async () => ({
    execAsync: async () => {},
    getFirstAsync: async () => null,
    getAllAsync: async (sql) => { state.sharedRows.push({ sql }); return []; },
    runAsync: async (sql, ...args) => { state.sharedRows.push({ sql, args }); },
    withTransactionAsync: async () => { throw new Error('shared-connection transaction'); },
    withExclusiveTransactionAsync: async (task) => {
      const pending = [];
      const txn = {
        getAllAsync: async () => [],
        runAsync: async (sql, ...args) => {
          if (state.failRecordingInsert && sql.includes('INSERT INTO recordings')) throw new Error('SQLITE_FULL');
          pending.push({ sql, args });
        },
      };
      await task(txn);
      state.rows.push(...pending);
    },
  });
`);
const mocks = {
  'expo-sqlite': sqliteUrl,
  'expo-file-system': data(`
    export const Paths = { document: { uri: 'file:///doc/' } };
    export class File { constructor() { this.exists = false; } write() {} delete() {} }
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
const { state } = await import(sqliteUrl);

const answer = { sessionId: 1, questionIndex: 0, question: 'Question?', text: 'Answer' };
const recording = { uri: 'file:///doc/rec.m4a', durationSec: 3, transcript: null };
const writes = (table) => state.rows.filter((row) => row.sql.includes(`INSERT INTO ${table}`));

test('a failed recording write rolls back the answer text as well', async () => {
  state.rows.length = 0;
  state.failRecordingInsert = true;
  try {
    await assert.rejects(db.saveAnswer(answer, [recording]), /SQLITE_FULL/);
  } finally {
    state.failRecordingInsert = false;
  }
  assert.equal(writes('answers').length, 0);
  assert.equal(writes('recordings').length, 0);
});

test('answer text and recordings are committed together in the exclusive transaction only', async () => {
  await db.getDb();
  state.rows.length = 0;
  state.sharedRows.length = 0;
  await db.saveAnswer(answer, [recording]);
  assert.equal(writes('answers').length, 1);
  assert.equal(writes('recordings').length, 1);
  assert.deepEqual(state.sharedRows, []);
});
