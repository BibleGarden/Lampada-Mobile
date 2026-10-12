import assert from 'node:assert/strict';
import test from 'node:test';
import {
  transcriptionErrorMessageKey,
  transcriptionFailureCode,
  transcriptionFailureDetails,
  transcriptionHttpError,
  transcriptionTransportError,
} from '../transcriptionErrors.ts';

test('HTTP errors preserve the reasons people can act on', () => {
  for (const [status, code] of [
    [413, 'too_long'], [429, 'rate_limited'], [500, 'unavailable'],
    [503, 'unavailable'], [400, 'unknown'],
  ]) {
    assert.equal(transcriptionFailureCode(transcriptionHttpError(status)), code);
    assert.equal(transcriptionHttpError(status).status, status);
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

test('failure details name the category, HTTP status and error class but no message text', () => {
  assert.deepEqual(
    transcriptionFailureDetails(transcriptionHttpError(415)),
    { code: 'unknown', errorClass: 'TranscriptionError', status: 415 },
  );
  assert.deepEqual(
    transcriptionFailureDetails(transcriptionTransportError(new TypeError('Network request failed'), false, false)),
    { code: 'network', errorClass: 'TypeError' },
  );
  assert.deepEqual(
    transcriptionFailureDetails(new SyntaxError('Unexpected token < in a private reply')),
    { code: 'unknown', errorClass: 'SyntaxError' },
  );
  assert.deepEqual(transcriptionFailureDetails('failed'), { code: 'unknown', errorClass: 'string' });
});
