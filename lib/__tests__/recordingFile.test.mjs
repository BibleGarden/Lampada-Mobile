import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingFileIssue } from '../recordingFile.ts';

test('rejects a missing or header-only recording', () => {
  assert.equal(recordingFileIssue({ exists: false, size: 0 }, 5_000), 'missing');
  assert.equal(recordingFileIssue({ exists: true, size: 28 }, 5_000), 'incomplete');
});

test('rejects a file whose bytes do not match the recorded duration', () => {
  assert.equal(recordingFileIssue({ exists: true, size: 57_380 }, 11_000), 'incomplete');
});

test('accepts complete high-quality recordings', () => {
  assert.equal(recordingFileIssue({ exists: true, size: 128_098 }, 5_000), null);
  assert.equal(recordingFileIssue({ exists: true, size: 344_702 }, 21_000), null);
});
