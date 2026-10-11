import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Часовой пояс с DST и с датой, отличной от UTC вечером: местный день
// молитвы должен браться от started_at так же, как dayKey.
process.env.TZ = 'America/New_York';

const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const sqliteUrl = new URL('./nodeSqlite.mjs', import.meta.url).href;
const mocks = {
  'expo-sqlite': sqliteUrl,
  'expo-file-system': data(`
    export const Paths = { document: { uri: 'file:///doc/' } };
    export class File { constructor() { this.exists = false; } write() {} delete() {} }
  `),
  // Дневнику из схемы Писания нужна только связь цитаты с молитвой.
  './scriptureSchema': data(`
    export const migrateScriptureStorage = (db) => db.execAsync(
      'CREATE TABLE IF NOT EXISTS scripture_favorites (id INTEGER PRIMARY KEY, session_id INTEGER)',
    );
  `),
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
const { rawDatabase } = await import(sqliteUrl);

const at = (iso) => new Date(iso).getTime();
// 23:30 10 октября по Нью-Йорку — уже 11 октября по UTC.
const LATE_EVENING = at('2026-10-11T03:30:00Z');
const MORNING = at('2026-10-10T12:00:00Z');
const NEXT_DAY = at('2026-10-11T14:00:00Z');

const prayedDays = async () => {
  const d = await db.getDb();
  return (await d.getAllAsync('SELECT day FROM prayed_days ORDER BY day')).map((row) => row.day);
};
const journalIds = async () => (await db.getJournal()).map((entry) => entry.id);
const answer = (sessionId, text) => ({ sessionId, questionIndex: 0, question: 'Question?', text });

test('a session counts the local day it started once it appears in the journal', async () => {
  await db.wipeLocalData();
  const id = await db.createSession('Evening', 10, LATE_EVENING);
  assert.deepEqual(await journalIds(), []);
  assert.deepEqual(await prayedDays(), []);

  await db.saveAnswer(answer(id, 'Thank you'), []);
  assert.deepEqual(await journalIds(), [id]);
  assert.deepEqual(await prayedDays(), ['2026-10-10']);
});

test('a voice answer without text counts the day as well', async () => {
  await db.wipeLocalData();
  const id = await db.createSession('Voice', 10, MORNING);
  await db.saveAnswer(answer(id, ''), [{ uri: 'file:///doc/Audio/a.m4a', durationSec: 4, transcript: null }]);
  assert.deepEqual(await journalIds(), [id]);
  assert.deepEqual(await prayedDays(), ['2026-10-10']);
});

test('clearing the only answer before the first checkpoint removes the day with the entry', async () => {
  await db.wipeLocalData();
  const id = await db.createSession('Short', 10, MORNING);
  await db.saveAnswer(answer(id, 'Draft'), []);
  await db.saveAnswer(answer(id, '  '), []);
  assert.deepEqual(await journalIds(), []);
  assert.deepEqual(await prayedDays(), []);
});

test('an interrupted prayer keeps its checkpointed time and day; completion never lowers it', async () => {
  await db.wipeLocalData();
  const id = await db.createSession('Interrupted', 0, LATE_EVENING);
  await db.saveElapsedCheckpoint(id, 120);
  assert.deepEqual((await db.getJournal()).map((e) => [e.id, e.elapsedSec]), [[id, 120]]);
  assert.deepEqual(await prayedDays(), ['2026-10-10']);

  // Поздняя запись меньшего времени не откатывает сохранённое.
  await db.saveElapsedCheckpoint(id, 60);
  assert.equal((await db.getJournal())[0].elapsedSec, 120);
  await db.finishSession(id, 95, '');
  assert.equal((await db.getJournal())[0].elapsedSec, 120);
  await db.finishSession(id, 185, 'Takeaway');
  assert.deepEqual((await db.getJournal()).map((e) => [e.elapsedSec, e.takeaway]), [[185, 'Takeaway']]);
  assert.deepEqual(await prayedDays(), ['2026-10-10']);
});

test('a prayer finished the next day counts the day it started', async () => {
  await db.wipeLocalData();
  const id = await db.createSession('Overnight', 5, LATE_EVENING);
  await db.finishSession(id, 300, '');
  assert.deepEqual(await prayedDays(), ['2026-10-10']);
});

test('finishing an empty prayer without time leaves no entry and no day', async () => {
  await db.wipeLocalData();
  const id = await db.createSession('Empty', 5, MORNING);
  await db.finishSession(id, 0, '');
  assert.deepEqual(await journalIds(), []);
  assert.deepEqual(await prayedDays(), []);
});

test('deleting a prayer keeps its day only while another journal prayer started that day', async () => {
  await db.wipeLocalData();
  const morning = await db.createSession('Morning', 5, MORNING);
  const evening = await db.createSession('Evening', 5, LATE_EVENING);
  const nextDay = await db.createSession('Next day', 5, NEXT_DAY);
  await db.createSession('Abandoned', 5, MORNING);
  for (const id of [morning, evening, nextDay]) await db.finishSession(id, 300, '');
  assert.deepEqual(await prayedDays(), ['2026-10-10', '2026-10-11']);

  await db.deleteSession(evening);
  assert.deepEqual(await prayedDays(), ['2026-10-10', '2026-10-11']);
  await db.deleteSession(morning);
  // Брошенная пустая сессия того же дня не удерживает день.
  assert.deepEqual(await prayedDays(), ['2026-10-11']);
  assert.deepEqual(await journalIds(), [nextDay]);
  await assert.rejects(db.deleteSession(morning), /does not exist/);
});

test('the one-time backfill adds the days of journal sessions and keeps earlier days', async () => {
  await db.wipeLocalData();
  // База версии до ADR-0042: прерванные молитвы есть в дневнике, но не в серии.
  rawDatabase().exec(`
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '', planned_minutes INTEGER NOT NULL,
      elapsed_sec INTEGER NOT NULL DEFAULT 0, takeaway TEXT NOT NULL DEFAULT '');
    CREATE TABLE answers (
      session_id INTEGER NOT NULL, question_index INTEGER NOT NULL,
      question TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, question_index));
    CREATE TABLE recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL,
      question_index INTEGER NOT NULL, uri TEXT NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0, transcript TEXT NOT NULL DEFAULT '');
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE prayed_days (day TEXT PRIMARY KEY);

    INSERT INTO sessions (id, started_at, planned_minutes) VALUES
      (1, '2026-10-11T03:30:00.000Z', 10),
      (2, '2026-10-09T15:00:00.000Z', 10),
      (3, '2026-10-08T15:00:00.000Z', 10);
    INSERT INTO sessions (id, started_at, planned_minutes, elapsed_sec) VALUES
      (4, '2026-10-07T15:00:00.000Z', 10, 600);
    INSERT INTO answers VALUES (1, 0, 'Question?', 'Interrupted answer'), (2, 0, 'Question?', '   ');
    INSERT INTO recordings (session_id, question_index, uri) VALUES (3, 0, 'lampada-document:Audio/r.m4a');
    INSERT INTO prayed_days VALUES ('2026-09-01'), ('2026-10-07');
    INSERT INTO meta VALUES ('streak_last_day', '2026-08-20'), ('streak_count', '2');
  `);
  assert.deepEqual(await prayedDays(), [
    '2026-08-19', '2026-08-20', '2026-09-01', '2026-10-07', '2026-10-08', '2026-10-10',
  ]);
  const meta = (await (await db.getDb()).getAllAsync('SELECT key, value FROM meta ORDER BY key'))
    .map((row) => [row.key, row.value]);
  assert.deepEqual(meta, [['prayed_days_journal_backfill', '1']]);
});
