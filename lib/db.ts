import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { dayKey, getWeekIndicators, localDayBounds } from './streak';
import { resolveRecordingUri, toStoredRecordingUri } from './recordingUri';
import { migrateScriptureStorage } from './scriptureSchema';
import { recordingAudioState } from './recordingFile';

// All data stays on the device only.

const diagnosticLog = new File(Paths.document, 'lampada-diagnostics.log');

/** The kind of error without its message: messages may contain user data. */
export const errorKind = (error: unknown) => (error instanceof Error ? 'error' : typeof error);

/**
 * A safe diagnostic record, available even when SQLite fails.
 * Details include only codes and causes, never prayer content.
 */
export function recordDiagnostic(
  event:
    | 'session_start_failed'
    | 'answer_save_failed'
    | 'elapsed_checkpoint_failed'
    | 'version_check_ignored'
    | 'recording_audio_missing'
    | 'recording_playback_failed'
    | 'scripture_preferences_invalid'
    | 'scripture_selection_failed'
    | 'scripture_preferences_save_failed'
    | 'transcription_failed'
    | 'scripture_audio_failed'
    | 'scripture_audio_unavailable'
    | 'scripture_load_failed'
    | 'favorite_save_failed'
    | 'favorites_load_failed'
    | 'journal_failed'
    | 'consent_save_failed'
    | 'reminders_failed'
    | 'reminder_schedule_invalid'
    | 'settings_save_failed'
    | 'settings_load_failed'
    | 'ai_question_invalid'
    | 'secure_store_failed'
    | 'biometry_check_failed'
    | 'wipe_incomplete',
  details: Record<string, string | number>,
) {
  try {
    diagnosticLog.write(
      `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`,
      { append: true },
    );
  } catch {
    // Diagnostics must not change the user's flow on a file-system error.
  }
}

export type SessionRow = {
  id: number;
  startedAt: string; // ISO
  topic: string;
  plannedMinutes: number; // 0 = no timer
  elapsedSec: number;
  takeaway: string;
};

export type AnswerRow = {
  sessionId: number;
  questionIndex: number;
  question: string;
  text: string;
};

// Cache the promise, not the result: parallel first calls must not open
// the database and run the DDL twice
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// busy_timeout applies per connection: without it, a write under someone
// else's lock fails immediately with "database is locked" instead of
// waiting for it to clear. An expo-sqlite exclusive transaction opens a
// new connection, so set it there too.
const BUSY_TIMEOUT_PRAGMA = 'PRAGMA busy_timeout = 5000;';

/**
 * The single definition of a prayer visible in the journal, over the `s`
 * alias of the sessions table: it has saved time, a takeaway, a non-empty
 * answer, or a recording. Such a prayer counts its start day in
 * prayed_days (ADR-0042), so the journal and the streak cannot diverge.
 */
const JOURNAL_VISIBLE_SESSION = `(s.elapsed_sec > 0 OR s.takeaway != ''
  OR EXISTS (SELECT 1 FROM answers a WHERE a.session_id = s.id AND TRIM(a.text) != '')
  OR EXISTS (SELECT 1 FROM recordings r WHERE r.session_id = s.id))`;

type DbConnection = Pick<SQLite.SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

/** A day exists in prayed_days as long as the journal has a prayer started that day. */
async function syncPrayedDay(conn: DbConnection, day: string) {
  const [from, to] = localDayBounds(day);
  const visible = await conn.getFirstAsync(
    `SELECT 1 AS found FROM sessions s
      WHERE s.started_at >= ? AND s.started_at < ? AND ${JOURNAL_VISIBLE_SESSION}
      LIMIT 1`,
    from,
    to,
  );
  if (visible) {
    await conn.runAsync('INSERT OR IGNORE INTO prayed_days (day) VALUES (?)', day);
  } else {
    await conn.runAsync('DELETE FROM prayed_days WHERE day = ?', day);
  }
}

async function sessionDay(conn: DbConnection, sessionId: number): Promise<string> {
  const row = await conn.getFirstAsync<{ started_at: string }>(
    'SELECT started_at FROM sessions WHERE id = ?',
    sessionId,
  );
  if (!row) throw new Error(`Prayer session ${sessionId} does not exist`);
  return dayKey(new Date(row.started_at));
}

/** Called inside the transaction of every write that changes a session's journal visibility. */
async function syncSessionDay(conn: DbConnection, sessionId: number) {
  await syncPrayedDay(conn, await sessionDay(conn, sessionId));
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((e) => {
      dbPromise = null; // do not cache a failed open
      throw e;
    });
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('lampada.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    ${BUSY_TIMEOUT_PRAGMA}
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
    CREATE TABLE IF NOT EXISTS prayed_days (
      day TEXT PRIMARY KEY
    );
  `);
  await migrateScriptureStorage(db);
  await migrateRecordingUris(db);
  await migrateLegacyStreak(db);
  await backfillJournalDays(db);
  return db;
}

// The migrations below run during opening, before getDb() has handed the
// connection to other modules, so other work on the connection cannot
// interleave here.

/**
 * The old streak (count of days ending at last_day) is migrated into
 * prayed_days once: the keys are deleted in the same transaction.
 * Otherwise every open would resurrect a day removed by deleting its last
 * prayer.
 */
async function migrateLegacyStreak(db: SQLite.SQLiteDatabase) {
  const last = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'streak_last_day'",
  );
  if (!last) return;
  const cnt = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'streak_count'",
  );
  await db.withTransactionAsync(async () => {
    if (last.value) {
      const n = Math.max(1, parseInt(cnt?.value ?? '1', 10) || 1);
      const [yy, mm, dd] = last.value.split('-').map(Number);
      for (let i = 0; i < n; i++) {
        const dt = new Date(yy, mm - 1, dd);
        dt.setDate(dt.getDate() - i);
        await db.runAsync('INSERT OR IGNORE INTO prayed_days (day) VALUES (?)', dayKey(dt));
      }
    }
    await db.runAsync("DELETE FROM meta WHERE key IN ('streak_last_day', 'streak_count')");
  });
}

const JOURNAL_DAYS_BACKFILL_KEY = 'prayed_days_journal_backfill';

/**
 * Before ADR-0042 only completion marked the day, so an interrupted prayer
 * from the journal never got one. A one-time backfill: the day of every
 * session visible in the journal. The local day is derived with the same
 * `dayKey` from `started_at` (UTC ISO) as when saving, in the current time
 * zone. Existing days are not deleted: they were earned under the old
 * rule.
 */
async function backfillJournalDays(db: SQLite.SQLiteDatabase) {
  const done = await db.getFirstAsync('SELECT 1 AS found FROM meta WHERE key = ?', JOURNAL_DAYS_BACKFILL_KEY);
  if (done) return;
  const rows = await db.getAllAsync<{ started_at: string }>(
    `SELECT s.started_at FROM sessions s WHERE ${JOURNAL_VISIBLE_SESSION}`,
  );
  const days = new Set(rows.map((row) => dayKey(new Date(row.started_at))));
  await db.withTransactionAsync(async () => {
    for (const day of days) {
      await db.runAsync('INSERT OR IGNORE INTO prayed_days (day) VALUES (?)', day);
    }
    await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?)', JOURNAL_DAYS_BACKFILL_KEY, '1');
  });
}

async function migrateRecordingUris(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: number; uri: string }>('SELECT id, uri FROM recordings');
  for (const row of rows) {
    const storedUri = toStoredRecordingUri(row.uri, Paths.document.uri);
    if (storedUri !== row.uri) {
      await db.runAsync('UPDATE recordings SET uri = ? WHERE id = ? AND uri = ?', storedUri, row.id, row.uri);
    }
  }
}

export async function createSession(
  topic: string,
  plannedMinutes: number,
  startedAtMs: number,
): Promise<number> {
  const d = await getDb();
  const res = await d.runAsync(
    'INSERT INTO sessions (started_at, topic, planned_minutes) VALUES (?, ?, ?)',
    new Date(startedAtMs).toISOString(),
    topic,
    plannedMinutes,
  );
  return res.lastInsertRowId;
}

// Prayer time in the store only grows; MAX makes the write order-independent:
// a late checkpoint cannot reduce the total time.

/** Elapsed-time checkpoint of a running prayer (ADR-0042). */
export async function saveElapsedCheckpoint(id: number, elapsedSec: number) {
  const d = await getDb();
  await d.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(BUSY_TIMEOUT_PRAGMA);
    await txn.runAsync(
      'UPDATE sessions SET elapsed_sec = MAX(elapsed_sec, ?) WHERE id = ?',
      elapsedSec,
      id,
    );
    await syncSessionDay(txn, id);
  });
}

export async function finishSession(id: number, elapsedSec: number, takeaway: string) {
  const d = await getDb();
  await d.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(BUSY_TIMEOUT_PRAGMA);
    await txn.runAsync(
      'UPDATE sessions SET elapsed_sec = MAX(elapsed_sec, ?), takeaway = ? WHERE id = ?',
      elapsedSec,
      takeaway,
      id,
    );
    await syncSessionDay(txn, id);
  });
}

/**
 * The answer and its recordings are written in one transaction: text never
 * stays in the DB without recordings. Recordings are rewritten in full — no
 * duplicates, deleted ones go away. In the same transaction the prayer's
 * day is synced to its journal visibility.
 */
export async function saveAnswer(
  a: AnswerRow,
  recordings: { uri: string; durationSec: number; transcript: string | null }[],
) {
  const d = await getDb();
  const storedRecordings = recordings.map((r) => ({
    uri: toStoredRecordingUri(r.uri, Paths.document.uri),
    durationSec: r.durationSec,
    transcript: r.transcript?.trim() ?? '',
  }));
  let previous: { uri: string }[] = [];
  // The transaction has its own connection: other requests cannot interleave.
  await d.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(BUSY_TIMEOUT_PRAGMA);
    // The write goes first: it takes the lock with waiting. A leading read
    // would make the transaction read-only, and its upgrade to a write
    // after someone else's commit would fail with SQLITE_BUSY_SNAPSHOT,
    // which busy_timeout does not cover.
    await txn.runAsync(
      `INSERT INTO answers (session_id, question_index, question, text) VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, question_index) DO UPDATE SET question = excluded.question, text = excluded.text`,
      a.sessionId,
      a.questionIndex,
      a.question,
      a.text,
    );
    previous = await txn.getAllAsync<{ uri: string }>(
      'SELECT uri FROM recordings WHERE session_id = ? AND question_index = ?',
      a.sessionId,
      a.questionIndex,
    );
    await txn.runAsync(
      'DELETE FROM recordings WHERE session_id = ? AND question_index = ?',
      a.sessionId,
      a.questionIndex,
    );
    for (const r of storedRecordings) {
      await txn.runAsync(
        `INSERT INTO recordings
           (session_id, question_index, uri, duration_sec, transcript)
         VALUES (?, ?, ?, ?, ?)`,
        a.sessionId,
        a.questionIndex,
        r.uri,
        r.durationSec,
        r.transcript,
      );
    }
    await syncSessionDay(txn, a.sessionId);
  });

  const retained = new Set(storedRecordings.map((r) => r.uri));
  deleteRecordingFiles(previous.map((r) => r.uri).filter((uri) => !retained.has(uri)));
}

// ---- journal: prayer history, search, deletion ----

export type JournalEntry = {
  id: number;
  startedAt: string;
  topic: string;
  elapsedSec: number;
  takeaway: string;
  answerCount: number;
  favoriteCount: number;
};

export type JournalDetail = {
  answers: { questionIndex: number; question: string; text: string }[];
  recordings: {
    id: number;
    questionIndex: number;
    uri: string;
    durationSec: number;
    transcript: string | null;
    /** The recording file exists on this device; without it the row remains for its transcript. */
    audioAvailable: boolean;
  }[];
};

/**
 * The prayer list for the journal, newest first. Sessions without saved
 * time, an answer, a recording, or a takeaway are not shown — they are
 * abandoned attempts, not prayers. The query searches the topic, takeaway,
 * and question/answer texts.
 *
 * Case folding happens in JS: SQLite's LIKE is case-insensitive only for
 * ASCII and does not fold Cyrillic («Тревога» does not match «тревога»),
 * and lower() without the ICU extension does not either.
 * So the searchable text is fetched as one string and filtered with
 * toLowerCase().includes() (which handles Unicode correctly).
 */
export async function getJournal(query = ''): Promise<JournalEntry[]> {
  const d = await getDb();
  const q = query.trim().toLowerCase();
  const rows = await d.getAllAsync<{
    id: number;
    started_at: string;
    topic: string;
    elapsed_sec: number;
    takeaway: string;
    answer_count: number;
    favorite_count: number;
    search_blob: string | null;
    recording_search_blob: string | null;
  }>(
    `SELECT s.id, s.started_at, s.topic, s.elapsed_sec, s.takeaway,
            (SELECT COUNT(*) FROM answers a
              WHERE a.session_id = s.id AND TRIM(a.text) != '') AS answer_count,
            (SELECT COUNT(*) FROM scripture_favorites f
              WHERE f.session_id = s.id) AS favorite_count,
            (SELECT GROUP_CONCAT(a.text || ' ' || a.question, ' ')
               FROM answers a WHERE a.session_id = s.id) AS search_blob,
            (SELECT GROUP_CONCAT(r.transcript, ' ')
               FROM recordings r WHERE r.session_id = s.id) AS recording_search_blob
       FROM sessions s
      WHERE ${JOURNAL_VISIBLE_SESSION}
      ORDER BY s.started_at DESC`,
  );
  return rows
    .filter(
      (r) =>
        !q ||
        `${r.topic} ${r.takeaway} ${r.search_blob ?? ''} ${r.recording_search_blob ?? ''}`
          .toLowerCase()
          .includes(q),
    )
    .map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      topic: r.topic,
      elapsedSec: r.elapsed_sec,
      takeaway: r.takeaway,
      answerCount: r.answer_count,
      favoriteCount: r.favorite_count,
    }));
}

/** Contents of one prayer: question-answer pairs and audio recordings */
export async function getJournalDetail(sessionId: number): Promise<JournalDetail> {
  const d = await getDb();
  const answers = await d.getAllAsync<{ question_index: number; question: string; text: string }>(
    `SELECT question_index, question, text FROM answers
      WHERE session_id = ?
        AND (TRIM(text) != '' OR EXISTS (
          SELECT 1 FROM recordings r
           WHERE r.session_id = answers.session_id
             AND r.question_index = answers.question_index
        ))
      ORDER BY question_index`,
    sessionId,
  );
  const recordings = await d.getAllAsync<{
    id: number;
    question_index: number;
    uri: string;
    duration_sec: number;
    transcript: string;
  }>(
    `SELECT id, question_index, uri, duration_sec, transcript
       FROM recordings WHERE session_id = ? ORDER BY question_index, id`,
    sessionId,
  );
  return {
    answers: answers.map((a) => ({ questionIndex: a.question_index, question: a.question, text: a.text })),
    recordings: recordings.map((r) => {
      const uri = resolveRecordingUri(r.uri, Paths.document.uri);
      const audio = recordingAudioState(() => new File(uri).exists);
      if (audio !== 'available') {
        recordDiagnostic('recording_audio_missing', { recordingId: r.id, reason: audio });
      }
      return {
        id: r.id,
        questionIndex: r.question_index,
        uri,
        durationSec: r.duration_sec,
        transcript: r.transcript.trim() || null,
        audioAvailable: audio === 'available',
      };
    }),
  };
}

/** Save one recording's transcript without rewriting the answer's other files. */
export async function updateRecordingTranscript(recordingId: number, transcript: string) {
  const d = await getDb();
  await d.runAsync(
    'UPDATE recordings SET transcript = ? WHERE id = ?',
    transcript.trim(),
    recordingId,
  );
}

/**
 * Delete a prayer with all its answers and recordings. The streak day
 * remains only if the journal has another prayer started the same day.
 */
export async function deleteSession(sessionId: number) {
  const d = await getDb();
  // started_at never changes, so it is read before the transaction: the
  // transaction's first operation must be a write (see saveAnswer).
  const day = await sessionDay(d, sessionId);
  const recordings = await d.getAllAsync<{ uri: string }>(
    'SELECT uri FROM recordings WHERE session_id = ?',
    sessionId,
  );
  await d.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(BUSY_TIMEOUT_PRAGMA);
    await txn.runAsync('DELETE FROM recordings WHERE session_id = ?', sessionId);
    await txn.runAsync('DELETE FROM answers WHERE session_id = ?', sessionId);
    await txn.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
    await syncPrayedDay(txn, day);
  });
  deleteRecordingFiles(recordings.map((r) => r.uri));
}

function deleteRecordingFiles(uris: string[]) {
  for (const uri of uris) {
    try {
      const file = new File(resolveRecordingUri(uri, Paths.document.uri));
      if (file.exists) file.delete();
    } catch {
      // The database deletion must still succeed if iOS already removed a file.
    }
  }
}

/**
 * Complete erasure of local data: the journal, answers, audio recordings,
 * favorites, the scripture cache, streak, and settings. Used only by the
 * forgotten-PIN reset (ADR-0014), where irreversibility is confirmed by
 * the user twice.
 *
 * The database is deleted as a whole file rather than via DELETE per
 * table: this leaves behind neither a forgotten table nor WAL contents.
 * The next `getDb()` recreates the empty schema through the usual
 * migration.
 */
export async function wipeLocalData(): Promise<void> {
  // Audio file paths live in the database, so collect them before deleting it.
  let recordingUris: string[] = [];
  try {
    const d = await getDb();
    const rows = await d.getAllAsync<{ uri: string }>('SELECT uri FROM recordings');
    recordingUris = rows.map((r) => r.uri);
    await d.closeAsync();
  } catch {
    // A corrupted or unclosed database must still be deleted: recording
    // files then survive only if they could not be enumerated.
  }
  // The promise cache is reset before deleting the file: a parallel
  // getDb() must not return a handle to an already deleted database.
  dbPromise = null;
  await SQLite.deleteDatabaseAsync('lampada.db');
  deleteRecordingFiles(recordingUris);
  try {
    if (diagnosticLog.exists) diagnosticLog.delete();
  } catch {
    // The diagnostic log holds no user data: its absence or a deletion
    // error must not break the wipe.
  }
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

// ---- streak: a day counts by the local start date of a journal prayer ----

export type Streak = { count: number; prayedToday: boolean; week: boolean[] };

async function getWeek(): Promise<boolean[]> {
  const d = await getDb();
  return getWeekIndicators(async (firstDay, lastDay) => {
    const rows = await d.getAllAsync<{ day: string }>(
      'SELECT day FROM prayed_days WHERE day BETWEEN ? AND ?',
      firstDay,
      lastDay,
    );
    return rows.map((row) => row.day);
  });
}

// The streak is derived from prayed_days with no separate counter — the
// calendar dots and the "N-day streak" caption cannot diverge.
export async function getStreak(): Promise<Streak> {
  const week = await getWeek();
  const d = await getDb();
  const rows = await d.getAllAsync<{ day: string }>(
    'SELECT day FROM prayed_days ORDER BY day DESC LIMIT 400',
  );
  const prayed = new Set(rows.map((r) => r.day));
  const prayedToday = prayed.has(dayKey(new Date()));

  // Streak: consecutive calendar days ending today or yesterday.
  // Dates step via setDate, not minus 24 hours: DST can make a day 23 hours long.
  const cursor = new Date();
  if (!prayedToday) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (prayed.has(dayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { count, prayedToday, week };
}
