import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTranscriptionUrl } from '../transcriptionConfig.ts';

test('uses an explicit transcription endpoint when configured', () => {
  assert.equal(
    resolveTranscriptionUrl('https://proxy.test/api/ai/transcribe', 'https://proxy.test/api/ai/question'),
    'https://proxy.test/api/ai/transcribe',
  );
});

test('derives transcription endpoint from the companion endpoint', () => {
  assert.equal(
    resolveTranscriptionUrl(undefined, 'https://proxy.test/api/ai/question'),
    'https://proxy.test/api/ai/transcribe',
  );
  assert.equal(
    resolveTranscriptionUrl(undefined, 'https://proxy.test/api/ai/question/'),
    'https://proxy.test/api/ai/transcribe',
  );
});

test('reports missing transcription configuration', () => {
  assert.equal(resolveTranscriptionUrl(undefined, undefined), null);
  assert.equal(resolveTranscriptionUrl(undefined, 'https://proxy.test/api/ai/not-question'), null);
});
