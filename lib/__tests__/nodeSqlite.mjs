// Двойник expo-sqlite поверх node:sqlite: настоящий SQL и транзакции в памяти.
// Транзакции в тестах идут последовательно, поэтому эксклюзивная транзакция
// использует то же соединение. deleteDatabaseAsync начинает новую пустую базу.
import { DatabaseSync } from 'node:sqlite';

let raw = new DatabaseSync(':memory:');

/** Сырая база, которую откроет следующий openDatabaseAsync: для засева старых данных. */
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
