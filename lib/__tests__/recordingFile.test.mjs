import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordingDurationMillis,
  recordingFileIssue,
  waitForRecordingFile,
} from '../recordingFile.ts';

test('rejects a missing or header-only recording', () => {
  assert.equal(recordingFileIssue({ exists: false, size: 0 }), 'missing');
  assert.equal(recordingFileIssue({ exists: true, size: 28 }), 'incomplete');
  assert.equal(recordingFileIssue({ exists: true, size: null }), 'incomplete');
});

test('accepts a complete file regardless of effective AAC bitrate', () => {
  assert.equal(recordingFileIssue({ exists: true, size: 4_096 }), null);
  assert.equal(recordingFileIssue({ exists: true, size: 57_380 }), null);
  assert.equal(recordingFileIssue({ exists: true, size: 344_702 }), null);
});

test('falls back to wall time only when native duration is unavailable', () => {
  assert.equal(recordingDurationMillis(4_321, 1_000, 8_000), 4_321);
  assert.equal(recordingDurationMillis(0, 1_000, 8_000), 7_000);
  assert.equal(recordingDurationMillis(0, null, 8_000), 0);
});

test('waits for recording metadata to become present and stable', async () => {
  const snapshots = [
    { exists: false, size: 0 },
    { exists: true, size: 900 },
    { exists: true, size: 8_192 },
    { exists: true, size: 12_288 },
    { exists: true, size: 12_288 },
  ];
  let reads = 0;
  const waits = [];

  const metadata = await waitForRecordingFile(
    () => snapshots[Math.min(reads++, snapshots.length - 1)],
    async (millis) => waits.push(millis),
  );

  assert.deepEqual(metadata, { exists: true, size: 12_288 });
  assert.equal(reads, 5);
  assert.deepEqual(waits, [50, 50, 50, 50]);
});
