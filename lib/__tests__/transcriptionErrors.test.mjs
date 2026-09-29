import assert from 'node:assert/strict';
import test from 'node:test';
import {
  transcriptionErrorMessageKey,
  transcriptionFailureCode,
  transcriptionHttpError,
  transcriptionTransportError,
} from '../transcriptionErrors.ts';

test('HTTP errors preserve the reasons people can act on', () => {
  for (const [status, code] of [
    [413, 'too_long'], [429, 'rate_limited'], [500, 'unavailable'],
    [503, 'unavailable'], [400, 'unknown'],
  ]) {
    assert.equal(transcriptionFailureCode(transcriptionHttpError(status)), code);
    assert.match(transcriptionErrorMessageKey(code), /^components\.answers\./);
  }
});

test('timeout, disconnected network, and deliberate cancellation remain distinct', () => {
  const cause = new Error('transport failed');
  assert.equal(transcriptionFailureCode(transcriptionTransportError(cause, true, false)), 'timeout');
  assert.equal(transcriptionFailureCode(transcriptionTransportError(cause, false, false)), 'network');
  assert.equal(transcriptionTransportError(cause, false, true), cause);
  assert.equal(transcriptionFailureCode(cause), 'unknown');
});
