import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { dayKey, getWeekIndicators } from './streak';
import { resolveRecordingUri, toStoredRecordingUri } from './recordingUri';
import { migrateScriptureStorage } from './scriptureSchema';

// Все данные — только на устройстве.

const diagnosticLog = new File(Paths.document, 'lampada-diagnostics.log');

/** Безопасная диагностическая запись, доступная даже при ошибке SQLite. */
export function recordDiagnostic(event: 'session_start_failed', error: unknown) {
  try {
    diagnosticLog.write(
      `${JSON.stringify({
        at: new Date().toISOString(),
        event,
        errorKind: error instanceof Error ? 'error' : typeof error,
      })}\n`,
      { append: true },
    );
  } catch {
    // Диагностика не должна менять пользовательский сценарий при ошибке файловой системы.
  }
}

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
    CREATE TABLE IF NOT EXISTS prayed_days (
      day TEXT PRIMARY KEY
    );
  `);
  await migrateScriptureStorage(db);
  await migrateRecordingUris(db);
  // дозаполнить prayed_days из старого стрика: count дней, заканчивая last_day.
  // Идемпотентно (OR IGNORE), так что можно гнать при каждом открытии
  const last = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'streak_last_day'",
  );
  const cnt = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'streak_count'",
  );
  if (last?.value) {
    const n = Math.max(1, parseInt(cnt?.value ?? '1', 10) || 1);
    const [yy, mm, dd] = last.value.split('-').map(Number);
    for (let i = 0; i < n; i++) {
      const dt = new Date(yy, mm - 1, dd);
      dt.setDate(dt.getDate() - i);
      await db.runAsync('INSERT OR IGNORE INTO prayed_days (day) VALUES (?)', dayKey(dt));
    }
  }
  return db;
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
  recordings: { uri: string; durationSec: number; transcript: string | null }[],
) {
  const d = await getDb();
  const storedRecordings = recordings.map((r) => ({
    uri: toStoredRecordingUri(r.uri, Paths.document.uri),
    durationSec: r.durationSec,
    transcript: r.transcript?.trim() ?? '',
  }));
  const previous = await d.getAllAsync<{ uri: string }>(
    'SELECT uri FROM recordings WHERE session_id = ? AND question_index = ?',
    sessionId,
    questionIndex,
  );
  await d.withTransactionAsync(async () => {
    await d.runAsync(
      'DELETE FROM recordings WHERE session_id = ? AND question_index = ?',
      sessionId,
      questionIndex,
    );
    for (const r of storedRecordings) {
      await d.runAsync(
        `INSERT INTO recordings
           (session_id, question_index, uri, duration_sec, transcript)
         VALUES (?, ?, ?, ?, ?)`,
        sessionId,
        questionIndex,
        r.uri,
        r.durationSec,
        r.transcript,
      );
    }
  });

  const retained = new Set(storedRecordings.map((r) => r.uri));
  deleteRecordingFiles(previous.map((r) => r.uri).filter((uri) => !retained.has(uri)));
}

// ---- дневник: история молитв, поиск, удаление ----

export type JournalEntry = {
  id: number;
  startedAt: string;
  topic: string;
  elapsedSec: number;
  takeaway: string;
  answerCount: number;
};

export type JournalDetail = {
  answers: { questionIndex: number; question: string; text: string }[];
  recordings: {
    id: number;
    questionIndex: number;
    uri: string;
    durationSec: number;
    transcript: string | null;
  }[];
};

/**
 * Список молитв для дневника, свежие сверху. Пустые сессии (не завершена,
 * ни ответа, ни вывода) не показываются — это брошенные заходы, не молитвы.
 * query ищет по цели, выводу и текстам вопросов-ответов.
 *
 * Регистр сворачивается в JS: LIKE в SQLite регистронезависим только для
 * ASCII, кириллицу он не сворачивает («Тревога» != «тревога»), а lower()
 * без ICU-расширения — тоже. Поэтому тянем искомый текст одной строкой и
 * фильтруем через toLowerCase().includes() (Unicode понимает правильно).
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
    search_blob: string | null;
    recording_search_blob: string | null;
  }>(
    `SELECT s.id, s.started_at, s.topic, s.elapsed_sec, s.takeaway,
            (SELECT COUNT(*) FROM answers a
              WHERE a.session_id = s.id AND TRIM(a.text) != '') AS answer_count,
            (SELECT GROUP_CONCAT(a.text || ' ' || a.question, ' ')
               FROM answers a WHERE a.session_id = s.id) AS search_blob,
            (SELECT GROUP_CONCAT(r.transcript, ' ')
               FROM recordings r WHERE r.session_id = s.id) AS recording_search_blob
       FROM sessions s
      WHERE s.elapsed_sec > 0 OR s.takeaway != ''
             OR EXISTS (SELECT 1 FROM answers a WHERE a.session_id = s.id AND TRIM(a.text) != '')
             OR EXISTS (SELECT 1 FROM recordings r WHERE r.session_id = s.id)
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
    }));
}

/** Содержимое одной молитвы: пары вопрос-ответ и аудиозаписи */
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
    recordings: recordings.map((r) => ({
      id: r.id,
      questionIndex: r.question_index,
      uri: resolveRecordingUri(r.uri, Paths.document.uri),
      durationSec: r.duration_sec,
      transcript: r.transcript.trim() || null,
    })),
  };
}

/** Сохранить расшифровку одной записи без перезаписи остальных файлов ответа. */
export async function updateRecordingTranscript(recordingId: number, transcript: string) {
  const d = await getDb();
  await d.runAsync(
    'UPDATE recordings SET transcript = ? WHERE id = ?',
    transcript.trim(),
    recordingId,
  );
}

/** Удалить молитву со всеми ответами и записями. День в стрике остаётся. */
export async function deleteSession(sessionId: number) {
  const d = await getDb();
  const recordings = await d.getAllAsync<{ uri: string }>(
    'SELECT uri FROM recordings WHERE session_id = ?',
    sessionId,
  );
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM recordings WHERE session_id = ?', sessionId);
    await d.runAsync('DELETE FROM answers WHERE session_id = ?', sessionId);
    await d.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
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
 * Полное стирание локальных данных: дневник, ответы, аудиозаписи, избранное,
 * кэш Писания, streak и настройки. Используется только сбросом забытого
 * пин-кода (ADR-0014), где безвозвратность подтверждена пользователем дважды.
 *
 * База удаляется файлом целиком, а не через DELETE по таблицам: так не
 * остаётся ни забытой таблицы, ни содержимого WAL. Следующий `getDb()`
 * пересоздаёт пустую схему обычной миграцией.
 */
export async function wipeLocalData(): Promise<void> {
  // Пути к аудиофайлам живут в базе, поэтому собираем их до её удаления.
  let recordingUris: string[] = [];
  try {
    const d = await getDb();
    const rows = await d.getAllAsync<{ uri: string }>('SELECT uri FROM recordings');
    recordingUris = rows.map((r) => r.uri);
    await d.closeAsync();
  } catch {
    // Повреждённую или незакрытую базу всё равно нужно удалить: файлы записей
    // в этом случае останутся только если их не удалось перечислить.
  }
  // Кэш промиса сбрасывается до удаления файла: параллельный getDb() не должен
  // вернуть handle уже удалённой базы.
  dbPromise = null;
  await SQLite.deleteDatabaseAsync('lampada.db');
  deleteRecordingFiles(recordingUris);
  try {
    if (diagnosticLog.exists) diagnosticLog.delete();
  } catch {
    // Диагностический лог не содержит пользовательских данных: его отсутствие
    // или ошибка удаления не должны срывать стирание.
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

// ---- стрик: день засчитывается по календарной дате завершённой сессии ----

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

// Стрик выводится из prayed_days, отдельного счётчика нет — точки-календарь
// и подпись «N-й день подряд» не могут разойтись.
export async function getStreak(): Promise<Streak> {
  const week = await getWeek();
  const d = await getDb();
  const rows = await d.getAllAsync<{ day: string }>(
    'SELECT day FROM prayed_days ORDER BY day DESC LIMIT 400',
  );
  const prayed = new Set(rows.map((r) => r.day));
  const prayedToday = prayed.has(dayKey(new Date()));

  // серия: подряд идущие календарные дни, заканчивая сегодня либо вчера.
  // Дата через setDate, а не минус 24 часа: DST делает сутки 23-часовыми
  const cursor = new Date();
  if (!prayedToday) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (prayed.has(dayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { count, prayedToday, week };
}

/** Отметить сегодняшнюю молитву; возвращает новый стрик */
export async function markPrayedToday(): Promise<Streak> {
  const d = await getDb();
  await d.runAsync('INSERT OR IGNORE INTO prayed_days (day) VALUES (?)', dayKey(new Date()));
  return getStreak();
}
