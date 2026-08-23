import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRecordingUri, toStoredRecordingUri } from '../recordingUri.ts';

const currentDocuments =
  'file:///var/mobile/Containers/Data/Application/22222222-2222-4222-8222-222222222222/Documents/';

test('legacy iOS URI resolves against the current Documents container', () => {
  const legacy =
    'file:///var/mobile/Containers/Data/Application/11111111-1111-4111-8111-111111111111/Documents/recording-1.m4a';

  assert.equal(toStoredRecordingUri(legacy, currentDocuments), 'lampada-document:recording-1.m4a');
  assert.equal(
    resolveRecordingUri(legacy, currentDocuments),
    `${currentDocuments}recording-1.m4a`,
  );
});

test('plain simulator app-container path migrates to the current Documents URI', () => {
  const legacy =
    '/Users/test/Library/Developer/CoreSimulator/Devices/device/data/Containers/Data/Application/11111111-1111-4111-8111-111111111111/Documents/recording-2.m4a';

  assert.equal(toStoredRecordingUri(legacy, currentDocuments), 'lampada-document:recording-2.m4a');
  assert.equal(
    resolveRecordingUri(legacy, currentDocuments),
    `${currentDocuments}recording-2.m4a`,
  );
});

test('new Documents URI is stored without the changeable container path', () => {
  const current = `${currentDocuments}answers/voice%20note.m4a`;

  assert.equal(
    toStoredRecordingUri(current, currentDocuments),
    'lampada-document:answers/voice%20note.m4a',
  );
  assert.equal(resolveRecordingUri(toStoredRecordingUri(current, currentDocuments), currentDocuments), current);
});

test('already migrated URI remains idempotent', () => {
  const stored = 'lampada-document:answers/recording.m4a';

  assert.equal(toStoredRecordingUri(stored, currentDocuments), stored);
  assert.equal(resolveRecordingUri(stored, currentDocuments), `${currentDocuments}answers/recording.m4a`);
});

test('cache and external URIs are not incorrectly moved into Documents', () => {
  const cache =
    'file:///var/mobile/Containers/Data/Application/11111111-1111-4111-8111-111111111111/Library/Caches/recording.m4a';
  const external = 'content://media/external/audio/123';
  const arbitraryDocuments = '/Users/test/Documents/recording.m4a';

  assert.equal(toStoredRecordingUri(cache, currentDocuments), cache);
  assert.equal(resolveRecordingUri(cache, currentDocuments), cache);
  assert.equal(toStoredRecordingUri(external, currentDocuments), external);
  assert.equal(resolveRecordingUri(external, currentDocuments), external);
  assert.equal(toStoredRecordingUri(arbitraryDocuments, currentDocuments), arbitraryDocuments);
  assert.equal(resolveRecordingUri(arbitraryDocuments, currentDocuments), arbitraryDocuments);
});

test('unsafe or malformed relative values are never rebased', () => {
  const traversal = 'lampada-document:../Library/secret.m4a';
  const encodedTraversal = 'lampada-document:%2e%2e/Library/secret.m4a';
  const malformed = 'lampada-document:bad%ZZ.m4a';

  assert.equal(resolveRecordingUri(traversal, currentDocuments), traversal);
  assert.equal(resolveRecordingUri(encodedTraversal, currentDocuments), encodedTraversal);
  assert.equal(resolveRecordingUri(malformed, currentDocuments), malformed);
});
