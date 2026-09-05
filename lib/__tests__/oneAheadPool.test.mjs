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

test('a ready value is retrieved synchronously and clears the slot', async () => {
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

test('repeated prepare calls with the same key do not start another request', () => {
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

test('wait returns the existing pending request', async () => {
  const pool = createOneAheadPool();
  const request = deferred();
  const pending = pool.prepare('q-1', () => request.promise);

  assert.equal(pool.wait('q-1'), pending);
  request.resolve('дождались вопроса');

  assert.equal(await pool.wait('q-1'), 'дождались вопроса');
  await Promise.resolve();
  assert.equal(pool.takeReady('q-1'), 'дождались вопроса');
});

test('a late result from a stale request does not replace the new slot', async () => {
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

test('refill remains in the background after displaying a ready value', async () => {
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
