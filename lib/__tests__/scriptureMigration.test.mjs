import assert from 'node:assert/strict';
import test from 'node:test';

import {
  migrateLegacyFavorite,
  planLegacyFavoriteMigration,
} from '../scriptureMigration.ts';

const catalog = [
  { ref: 'Псалом 22:1', text: 'Господь — Пастырь мой.' },
  { ref: 'Иоанна 3:16', text: 'Ибо так возлюбил Бог мир.' },
];

test('migrates a known legacy favorite with its local text and exact legacy payload', () => {
  const row = { ref: 'Псалом 22:1', added_at: '2026-08-20T10:00:00.000Z' };

  assert.deepEqual(migrateLegacyFavorite(row, catalog), {
    canonicalId: null,
    reference: row.ref,
    title: null,
    text: 'Господь — Пастырь мой.',
    translationAlias: 'syn',
    language: 'ru',
    selection: null,
    createdAt: row.added_at,
    legacyRef: row.ref,
    legacy: row,
  });
});

test('retains an unknown legacy favorite instead of dropping or inventing data', () => {
  const row = { ref: 'Неизвестная ссылка', added_at: '2026-08-20T10:00:00.000Z' };
  const migrated = migrateLegacyFavorite(row, catalog);

  assert.equal(migrated.reference, row.ref);
  assert.equal(migrated.text, '');
  assert.equal(migrated.canonicalId, null);
  assert.equal(migrated.language, null);
  assert.deepEqual(migrated.legacy, row);
});

test('migration planning is idempotent and de-duplicates duplicate legacy rows', () => {
  const rows = [
    { ref: 'Псалом 22:1', added_at: '2026-08-20T10:00:00.000Z' },
    { ref: 'Иоанна 3:16', added_at: '2026-08-21T10:00:00.000Z' },
    { ref: 'Иоанна 3:16', added_at: '2026-08-22T10:00:00.000Z' },
  ];

  assert.deepEqual(
    planLegacyFavoriteMigration(rows, new Set(['Псалом 22:1']), catalog)
      .map((favorite) => favorite.reference),
    ['Иоанна 3:16'],
  );
  assert.deepEqual(
    planLegacyFavoriteMigration(rows, new Set(rows.map((row) => row.ref)), catalog),
    [],
  );
});

test('empty legacy storage produces no migration writes', () => {
  assert.deepEqual(planLegacyFavoriteMigration([], new Set(), catalog), []);
});
