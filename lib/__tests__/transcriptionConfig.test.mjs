import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTranscriptionUrl } from '../transcriptionConfig.ts';

test('uses an explicit transcription endpoint when configured', () => {
  assert.equal(
    resolveTranscriptionUrl('https://proxy.test/transcribe', 'https://proxy.test/complete'),
    'https://proxy.test/transcribe',
  );
});

test('derives transcription endpoint from the companion endpoint', () => {
  assert.equal(
    resolveTranscriptionUrl(undefined, 'https://proxy.test/api/lampada/v1/complete'),
    'https://proxy.test/api/lampada/v1/transcribe',
  );
  assert.equal(
    resolveTranscriptionUrl(undefined, 'https://proxy.test/api/lampada/v1/complete/'),
    'https://proxy.test/api/lampada/v1/transcribe',
  );
});

test('reports missing transcription configuration', () => {
  assert.equal(resolveTranscriptionUrl(undefined, undefined), null);
  assert.equal(resolveTranscriptionUrl(undefined, 'https://proxy.test/not-complete'), null);
});
