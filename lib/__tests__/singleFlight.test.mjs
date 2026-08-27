import assert from 'node:assert/strict';
import test from 'node:test';

import { createSingleFlight } from '../singleFlight.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('different scripture loads never overlap and retain their own results', async () => {
  const flight = createSingleFlight();
  const first = deferred();
  const second = deferred();
  const starts = [];

  const firstRun = flight.run(async () => {
    starts.push('first');
    return await first.promise;
  });
  const secondRun = flight.run(async () => {
    starts.push('second');
    return await second.promise;
  });

  assert.deepEqual(starts, ['first']);
  first.resolve('one');
  assert.equal(await firstRun, 'one');
  await Promise.resolve();
  assert.deepEqual(starts, ['first', 'second']);
  second.resolve('two');
  assert.equal(await secondRun, 'two');
  assert.equal(flight.isActive(), false);
});

test('a rejected request releases the next queued request', async () => {
  const flight = createSingleFlight();
  const first = deferred();
  let secondStarted = false;
  const rejected = flight.run(async () => await first.promise);
  const next = flight.run(async () => {
    secondStarted = true;
    return 'recovered';
  });

  first.resolve(Promise.reject(new Error('failed')));
  await assert.rejects(rejected, /failed/);
  assert.equal(await next, 'recovered');
  assert.equal(secondStarted, true);
});
