import { getDb } from './db';
import {
  parseScriptureSelection,
  type FavoriteScripture,
  type ScriptureDisplay,
  type ScriptureLanguage,
  type ScriptureSelection,
} from './scripture';

type CacheRow = {
  canonical_id: string;
  reference: string;
  language: string;
  selection_json: string;
  received_at: string;
  last_shown_at: string | null;
};

type FavoriteRow = {
  id: number;
  canonical_id: string | null;
  reference: string;
  title: string | null;
  text: string;
  translation_alias: string | null;
  language: string | null;
  legacy_json: string | null;
  created_at: string;
};

export type ScriptureBook = {
  bookNumber: number;
  name: string;
  alias: string;
  chaptersCount: number;
};

const isLanguage = (value: string): value is ScriptureLanguage =>
  value === 'ru' || value === 'en' || value === 'uk';

const parseJson = (value: string | null): unknown => {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

function displayFromCacheRow(row: CacheRow): ScriptureDisplay | null {
  const selection = parseScriptureSelection(parseJson(row.selection_json));
  if (!selection || !isLanguage(row.language)) return null;
  return {
    canonicalId: row.canonical_id,
    reference: row.reference,
    title: selection.passage.title,
    text: selection.passage.text,
    translationAlias: selection.passage.translation_alias,
    selection,
    receivedAt: row.received_at,
  };
}

async function writeCache(
  display: ScriptureDisplay,
  lastShownAt: string | null,
) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO scripture_cache
       (canonical_id, reference, language, selection_json, received_at, last_shown_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(canonical_id) DO UPDATE SET
       reference = excluded.reference,
       language = excluded.language,
       selection_json = excluded.selection_json,
       received_at = excluded.received_at,
       last_shown_at = COALESCE(excluded.last_shown_at, scripture_cache.last_shown_at)`,
    display.canonicalId,
    display.reference,
    display.selection.language,
    JSON.stringify(display.selection),
    display.receivedAt,
    lastShownAt,
  );
}

/** Persist a received/prefetched response without claiming it was shown. */
export async function cacheScripture(display: ScriptureDisplay) {
  await writeCache(display, null);
}

/** Atomically cache a displayed response and append it to persistent history. */
export async function recordScriptureShown(
  display: ScriptureDisplay,
  shownAt = new Date().toISOString(),
) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO scripture_cache
         (canonical_id, reference, language, selection_json, received_at, last_shown_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(canonical_id) DO UPDATE SET
         reference = excluded.reference,
         language = excluded.language,
         selection_json = excluded.selection_json,
         received_at = excluded.received_at,
         last_shown_at = excluded.last_shown_at`,
      display.canonicalId,
      display.reference,
      display.selection.language,
      JSON.stringify(display.selection),
      display.receivedAt,
      shownAt,
    );
    await db.runAsync(
      'INSERT INTO scripture_history (canonical_id, shown_at) VALUES (?, ?)',
      display.canonicalId,
      shownAt,
    );
  });
}

/** Oldest-to-newest order expected by buildScriptureRequest(). */
export async function getScriptureHistory(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ canonical_id: string }>(
    'SELECT canonical_id FROM scripture_history ORDER BY id',
  );
  return rows.map((row) => row.canonical_id);
}

export async function resetScriptureHistory(
  currentCanonicalId?: string,
  shownAt = new Date().toISOString(),
) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM scripture_history');
    if (currentCanonicalId) {
      await db.runAsync(
        'INSERT INTO scripture_history (canonical_id, shown_at) VALUES (?, ?)',
        currentCanonicalId,
        shownAt,
      );
    }
  });
}

/** Only actually shown rows are eligible for offline fallback. */
export async function getShownScriptureCache(limit?: number): Promise<ScriptureDisplay[]> {
  const db = await getDb();
  const safeLimit = limit === undefined ? null : Math.max(0, Math.floor(limit));
  const rows = safeLimit === null
    ? await db.getAllAsync<CacheRow>(
        `SELECT canonical_id, reference, language, selection_json, received_at, last_shown_at
           FROM scripture_cache WHERE last_shown_at IS NOT NULL
          ORDER BY last_shown_at DESC, canonical_id`,
      )
    : await db.getAllAsync<CacheRow>(
        `SELECT canonical_id, reference, language, selection_json, received_at, last_shown_at
           FROM scripture_cache WHERE last_shown_at IS NOT NULL
          ORDER BY last_shown_at DESC, canonical_id LIMIT ?`,
        safeLimit,
      );
  return rows.flatMap((row) => {
    const display = displayFromCacheRow(row);
    return display ? [{ ...display, offline: true }] : [];
  });
}

export async function addFavoriteScripture(
  display: ScriptureDisplay,
  createdAt = new Date().toISOString(),
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO scripture_favorites
       (canonical_id, reference, title, text, translation_alias, language,
        selection_json, legacy_ref, legacy_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(canonical_id) DO UPDATE SET
       reference = excluded.reference,
       title = excluded.title,
       text = excluded.text,
       translation_alias = excluded.translation_alias,
       language = excluded.language,
       selection_json = excluded.selection_json`,
    display.canonicalId,
    display.reference,
    display.title,
    display.text,
    display.translationAlias,
    display.selection.language,
    JSON.stringify(display.selection),
    null,
    null,
    createdAt,
  );
}

export async function removeFavoriteScripture(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM scripture_favorites WHERE id = ?', id);
}

export async function removeFavoriteByCanonicalId(canonicalId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM scripture_favorites WHERE canonical_id = ?', canonicalId);
}

export async function getFavoriteScriptures(): Promise<FavoriteScripture[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FavoriteRow>(
    `SELECT id, canonical_id, reference, title, text, translation_alias, language,
            legacy_json, created_at
       FROM scripture_favorites ORDER BY created_at DESC, id DESC`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    canonicalId: row.canonical_id,
    reference: row.reference,
    title: row.title,
    text: row.text,
    translationAlias: row.translation_alias,
    language: row.language !== null && isLanguage(row.language) ? row.language : null,
    createdAt: row.created_at,
    legacy: parseJson(row.legacy_json),
  }));
}

export async function replaceScriptureBooks(
  translation: number,
  books: readonly ScriptureBook[],
) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM scripture_books WHERE translation = ?', translation);
    for (const book of books) {
      await db.runAsync(
        `INSERT INTO scripture_books
           (translation, book_number, name, alias, chapters_count)
         VALUES (?, ?, ?, ?, ?)`,
        translation,
        book.bookNumber,
        book.name,
        book.alias,
        book.chaptersCount,
      );
    }
  });
}

export async function getScriptureBooks(translation: number): Promise<ScriptureBook[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    book_number: number;
    name: string;
    alias: string;
    chapters_count: number;
  }>(
    `SELECT book_number, name, alias, chapters_count
       FROM scripture_books WHERE translation = ? ORDER BY book_number`,
    translation,
  );
  return rows.map((row) => ({
    bookNumber: row.book_number,
    name: row.name,
    alias: row.alias,
    chaptersCount: row.chapters_count,
  }));
}

export async function getScriptureBookNames(
  translation: number,
): Promise<Record<number, string>> {
  return Object.fromEntries(
    (await getScriptureBooks(translation)).map((book) => [book.bookNumber, book.name]),
  );
}

/** Useful when a caller needs the exact cached selection, not the display projection. */
export async function getCachedSelection(
  canonicalId: string,
): Promise<ScriptureSelection | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ selection_json: string }>(
    'SELECT selection_json FROM scripture_cache WHERE canonical_id = ?',
    canonicalId,
  );
  return row ? parseScriptureSelection(parseJson(row.selection_json)) : null;
}
