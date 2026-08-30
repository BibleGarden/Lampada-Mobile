import type { FavoriteScripture } from './scripture';

export type LegacyFavoriteRow = {
  ref: string;
  added_at: string;
};

export type LegacyScripture = {
  ref: string;
  text: string;
};

export type LegacyFavoriteMigration = Omit<FavoriteScripture, 'id'> & {
  legacyRef: string;
};

/**
 * Lossless, deterministic conversion of the old ref-only favorite.
 * Unknown references are retained with an empty text instead of being dropped.
 */
export function migrateLegacyFavorite(
  row: LegacyFavoriteRow,
  catalog: readonly LegacyScripture[],
): LegacyFavoriteMigration {
  const scripture = catalog.find((candidate) => candidate.ref === row.ref);
  return {
    canonicalId: null,
    reference: row.ref,
    title: null,
    text: scripture?.text ?? '',
    translationAlias: scripture ? 'syn' : null,
    language: scripture ? 'ru' : null,
    selection: null,
    createdAt: row.added_at,
    legacyRef: row.ref,
    legacy: {
      ref: row.ref,
      added_at: row.added_at,
    },
  };
}

/** Pure planning helper used by the idempotent SQLite migration and its tests. */
export function planLegacyFavoriteMigration(
  rows: readonly LegacyFavoriteRow[],
  migratedRefs: ReadonlySet<string>,
  catalog: readonly LegacyScripture[],
): LegacyFavoriteMigration[] {
  const seen = new Set(migratedRefs);
  const result: LegacyFavoriteMigration[] = [];
  for (const row of rows) {
    if (seen.has(row.ref)) continue;
    seen.add(row.ref);
    result.push(migrateLegacyFavorite(row, catalog));
  }
  return result;
}
