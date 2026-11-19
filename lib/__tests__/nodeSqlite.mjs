// An expo-sqlite stand-in over node:sqlite: real SQL and in-memory transactions.
// Transactions in the tests run sequentially, so an exclusive transaction uses
// the same connection. deleteDatabaseAsync starts a fresh empty database.
import { DatabaseSync } from 'node:sqlite';

let raw = new DatabaseSync(':memory:');

/** The raw database the next openDatabaseAsync will open: for seeding legacy data. */
export const rawDatabase = () => raw;

const transaction = async (begin, task, connection) => {
  raw.exec(begin);
  try {
    await task(connection);
    raw.exec('COMMIT');
  } catch (error) {
    raw.exec('ROLLBACK');
    throw error;
  }
};

const connection = () => {
  const db = raw;
  const wrapped = {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, ...params) => {
      const result = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    withTransactionAsync: (task) => transaction('BEGIN', () => task(), wrapped),
    withExclusiveTransactionAsync: (task) => transaction('BEGIN EXCLUSIVE', task, wrapped),
    closeAsync: async () => {},
  };
  return wrapped;
};

export const openDatabaseAsync = async () => connection();

export const deleteDatabaseAsync = async () => {
  raw.close();
  raw = new DatabaseSync(':memory:');
};
