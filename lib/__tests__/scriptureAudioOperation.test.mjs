import assert from 'node:assert/strict';
import test from 'node:test';

import { createScriptureAudioOperation } from '../scriptureAudioOperation.ts';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function beginCachedResume(operation, grant, play) {
  const continuation = operation.begin();
  assert.ok(continuation);
  await grant;
  if (continuation.isCurrent()) play();
}

test('cached Scripture resume does not play after stop', async () => {
  const operation = createScriptureAudioOperation();
  operation.setContext('john-3:received:voice-1');
  const grant = deferred();
  let playCalls = 0;
  const resume = beginCachedResume(operation, grant.promise, () => {
    playCalls += 1;
  });

  operation.invalidate();
  grant.resolve();
  await resume;

  assert.equal(playCalls, 0);
});

test('cached Scripture resume does not play after excerpt changes', async () => {
  const operation = createScriptureAudioOperation();
  operation.setContext('john-3:received:voice-1');
  const grant = deferred();
  let playCalls = 0;
  const resume = beginCachedResume(operation, grant.promise, () => {
    playCalls += 1;
  });

  operation.setContext('psalm-23:received:voice-1');
  grant.resolve();
  await resume;

  assert.equal(playCalls, 0);
});

test('cached Scripture resume does not play after audio is disabled', async () => {
  const operation = createScriptureAudioOperation();
  operation.setContext('john-3:received:voice-1');
  const grant = deferred();
  let playCalls = 0;
  const resume = beginCachedResume(operation, grant.promise, () => {
    playCalls += 1;
  });

  operation.setContext(null);
  grant.resolve();
  await resume;

  assert.equal(playCalls, 0);
});
