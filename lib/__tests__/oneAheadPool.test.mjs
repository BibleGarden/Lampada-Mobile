import assert from 'node:assert/strict';
import test from 'node:test';

import { createOneAheadPool } from '../oneAheadPool.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('готовое значение забирается синхронно и очищает слот', async () => {
  const pool = createOneAheadPool();
  const request = deferred();

  pool.prepare('q-1', () => request.promise);
  assert.equal(pool.status('q-1'), 'pending');
  assert.equal(pool.takeReady('q-1'), undefined);

  request.resolve('готовый вопрос');
  await request.promise;
  await Promise.resolve();

  assert.equal(pool.status('q-1'), 'ready');
  assert.equal(pool.takeReady('q-1'), 'готовый вопрос');
  assert.equal(pool.status('q-1'), 'empty');
});

test('повторный prepare с тем же ключом не запускает второй запрос', () => {
  const pool = createOneAheadPool();
  const request = deferred();
  let calls = 0;
  const load = () => {
    calls++;
    return request.promise;
  };

  pool.prepare('q-1', load);
  pool.prepare('q-1', load);

  assert.equal(calls, 1);
});

test('wait возвращает уже запущенный pending-запрос', async () => {
  const pool = createOneAheadPool();
  const request = deferred();
  const pending = pool.prepare('q-1', () => request.promise);

  assert.equal(pool.wait('q-1'), pending);
  request.resolve('дождались вопроса');

  assert.equal(await pool.wait('q-1'), 'дождались вопроса');
  await Promise.resolve();
  assert.equal(pool.takeReady('q-1'), 'дождались вопроса');
});

test('поздний результат устаревшего запроса не заменяет новый слот', async () => {
  const pool = createOneAheadPool();
  const oldRequest = deferred();
  const newRequest = deferred();

  pool.prepare('old', () => oldRequest.promise);
  pool.prepare('new', () => newRequest.promise);
  oldRequest.resolve('устаревший вопрос');
  await oldRequest.promise;
  await Promise.resolve();

  assert.equal(pool.status('new'), 'pending');
  assert.equal(pool.takeReady('new'), undefined);

  newRequest.resolve('актуальный вопрос');
  await newRequest.promise;
  await Promise.resolve();

  assert.equal(pool.takeReady('new'), 'актуальный вопрос');
});

test('после показа готового значения refill остаётся фоновым', async () => {
  const pool = createOneAheadPool();
  const firstRequest = deferred();
  const refillRequest = deferred();

  pool.prepare('first', () => firstRequest.promise);
  firstRequest.resolve('первый готовый вопрос');
  await firstRequest.promise;
  await Promise.resolve();

  const shown = pool.takeReady('first');
  pool.prepare('refill', () => refillRequest.promise);

  assert.equal(shown, 'первый готовый вопрос');
  assert.equal(pool.status('refill'), 'pending');
  assert.equal(pool.takeReady('refill'), undefined);
});
