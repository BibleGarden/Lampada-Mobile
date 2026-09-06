import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceLocale } from '../transcriptionConfig.ts';

test('transcription includes the device locale when available', () => {
  assert.equal(deviceLocale(), Intl.DateTimeFormat().resolvedOptions().locale);
});
