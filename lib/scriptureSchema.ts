import type * as SQLite from 'expo-sqlite';
import { scriptures } from './scriptures';
import {
  planLegacyFavoriteMigration,
  type LegacyFavoriteRow,
} from './scriptureMigration';

const SCRIPTURE_SCHEMA_VERSION = 1;
const SCRIPTURE_SCHEMA_KEY = 'scripture_schema_version';

/** Create scripture storage and losslessly migrate the old ref-only favorites. */
export async function migrateScriptureStorage(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS scripture_cache (
      canonical_id TEXT PRIMARY KEY,
      reference TEXT NOT NULL,
      language TEXT NOT NULL,
      selection_json TEXT NOT NULL,
      received_at TEXT NOT NULL,
      last_shown_at TEXT
    );
    CREATE INDEX IF NOT EXISTS scripture_cache_last_shown_idx
      ON scripture_cache(last_shown_at DESC);

    CREATE TABLE IF NOT EXISTS scripture_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      shown_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scripture_history_shown_idx
      ON scripture_history(shown_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS scripture_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT UNIQUE,
      reference TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL DEFAULT '',
      translation_alias TEXT,
      language TEXT,
      selection_json TEXT,
      legacy_ref TEXT UNIQUE,
      legacy_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scripture_favorites_created_idx
      ON scripture_favorites(created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS scripture_books (
      translation INTEGER NOT NULL,
      book_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      alias TEXT NOT NULL,
      chapters_count INTEGER NOT NULL,
      PRIMARY KEY (translation, book_number)
    );

    CREATE TABLE IF NOT EXISTS favorites_legacy_backup (
      ref TEXT PRIMARY KEY,
      added_at TEXT NOT NULL,
      backed_up_at TEXT NOT NULL
    );
  `);

  const versionRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    SCRIPTURE_SCHEMA_KEY,
  );
  const currentVersion = Number.parseInt(versionRow?.value ?? '0', 10) || 0;
  if (currentVersion >= SCRIPTURE_SCHEMA_VERSION) return;

  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const legacyRows = await db.getAllAsync<LegacyFavoriteRow>(
      'SELECT ref, added_at FROM favorites ORDER BY added_at, ref',
    );
    for (const row of legacyRows) {
      await db.runAsync(
        `INSERT OR IGNORE INTO favorites_legacy_backup (ref, added_at, backed_up_at)
         VALUES (?, ?, ?)`,
        row.ref,
        row.added_at,
        now,
      );
    }

    const migrated = await db.getAllAsync<{ legacy_ref: string }>(
      'SELECT legacy_ref FROM scripture_favorites WHERE legacy_ref IS NOT NULL',
    );
    const planned = planLegacyFavoriteMigration(
      legacyRows,
      new Set(migrated.map((row) => row.legacy_ref)),
      scriptures,
    );
    for (const favorite of planned) {
      await db.runAsync(
        `INSERT OR IGNORE INTO scripture_favorites
           (canonical_id, reference, title, text, translation_alias, language,
            selection_json, legacy_ref, legacy_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        null,
        favorite.reference,
        favorite.title,
        favorite.text,
        favorite.translationAlias,
        favorite.language,
        null,
        favorite.legacyRef,
        JSON.stringify(favorite.legacy),
        favorite.createdAt,
      );
    }

    await db.runAsync(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      SCRIPTURE_SCHEMA_KEY,
      String(SCRIPTURE_SCHEMA_VERSION),
    );
  });
}
