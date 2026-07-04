import * as SQLite from 'expo-sqlite';

// Все данные — только на устройстве.

export type SessionRow = {
  id: number;
  startedAt: string; // ISO
  topic: string;
  plannedMinutes: number; // 0 = без таймера
  elapsedSec: number;
  takeaway: string;
};

export type AnswerRow = {
  sessionId: number;
  questionIndex: number;
  question: string;
  text: string;
};

// кэшируем промис, а не результат: параллельные первые вызовы
// не должны открывать базу и гнать DDL дважды
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((e) => {
      dbPromise = null; // не кэшировать неудачное открытие
      throw e;
    });
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('lampada.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      planned_minutes INTEGER NOT NULL,
      elapsed_sec INTEGER NOT NULL DEFAULT 0,
      takeaway TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS answers (
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      question_index INTEGER NOT NULL,
      question TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, question_index)
    );
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      question_index INTEGER NOT NULL,
      uri TEXT NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      transcript TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS favorites (
      ref TEXT PRIMARY KEY,
      added_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export async function createSession(topic: string, plannedMinutes: number): Promise<number> {
  const d = await getDb();
  const res = await d.runAsync(
    'INSERT INTO sessions (started_at, topic, planned_minutes) VALUES (?, ?, ?)',
    new Date().toISOString(),
    topic,
    plannedMinutes,
  );
  return res.lastInsertRowId;
}

export async function finishSession(id: number, elapsedSec: number, takeaway: string) {
  const d = await getDb();
  await d.runAsync(
    'UPDATE sessions SET elapsed_sec = ?, takeaway = ? WHERE id = ?',
    elapsedSec,
    takeaway,
    id,
  );
}

export async function saveAnswer(a: AnswerRow) {
  const d = await getDb();
  await d.runAsync(
    `INSERT INTO answers (session_id, question_index, question, text) VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, question_index) DO UPDATE SET question = excluded.question, text = excluded.text`,
    a.sessionId,
    a.questionIndex,
    a.question,
    a.text,
  );
}

/** Полная перезапись записей ответа: без дублей, удалённые уходят из БД */
export async function replaceRecordings(
  sessionId: number,
  questionIndex: number,
  recordings: { uri: string; durationSec: number }[],
) {
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    await d.runAsync(
      'DELETE FROM recordings WHERE session_id = ? AND question_index = ?',
      sessionId,
      questionIndex,
    );
    for (const r of recordings) {
      await d.runAsync(
        'INSERT INTO recordings (session_id, question_index, uri, duration_sec) VALUES (?, ?, ?, ?)',
        sessionId,
        questionIndex,
        r.uri,
        r.durationSec,
      );
    }
  });
}

export async function toggleFavorite(ref: string): Promise<boolean> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ ref: string }>('SELECT ref FROM favorites WHERE ref = ?', ref);
  if (row) {
    await d.runAsync('DELETE FROM favorites WHERE ref = ?', ref);
    return false;
  }
  await d.runAsync('INSERT INTO favorites (ref, added_at) VALUES (?, ?)', ref, new Date().toISOString());
  return true;
}

export async function getFavorites(): Promise<string[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ ref: string }>('SELECT ref FROM favorites');
  return rows.map((r) => r.ref);
}

// ---- стрик: день засчитывается по календарной дате завершённой сессии ----

const dayKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export type Streak = { count: number; prayedToday: boolean };

async function getMeta(key: string): Promise<string | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string) {
  const d = await getDb();
  await d.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getStreak(): Promise<Streak> {
  const count = parseInt((await getMeta('streak_count')) ?? '0', 10) || 0;
  const lastDay = await getMeta('streak_last_day');
  const today = dayKey(new Date());
  if (lastDay === today) return { count, prayedToday: true };
  // «вчера» через календарную дату, а не минус 24 часа: DST-переход
  // делает сутки 23-часовыми и ломает арифметику на миллисекундах
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (lastDay === dayKey(y)) return { count, prayedToday: false };
  // пропуск дня — стрик сгорел
  return { count: 0, prayedToday: false };
}

/** Отметить сегодняшнюю молитву; возвращает новый стрик */
export async function markPrayedToday(): Promise<Streak> {
  const { count, prayedToday } = await getStreak();
  if (prayedToday) return { count, prayedToday: true };
  const next = count + 1;
  await setMeta('streak_count', String(next));
  await setMeta('streak_last_day', dayKey(new Date()));
  return { count: next, prayedToday: true };
}
