import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStoppedRecordingDraft,
  recordedFileDurationSeconds,
  recordedSeconds,
  recordingFileIssue,
  waitForRecordingFile,
} from '../recordingFile.ts';
import { recordingExceedsDurationLimit } from '../transcriptionLimits.ts';

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

test('reads duration from the finished audio file, not a delayed JS completion event', async () => {
  let status = { isLoaded: false, duration: 0, error: null };
  const durationSec = await recordedFileDurationSeconds(() => status, async () => {
    status = { isLoaded: true, duration: 40, error: null };
  });
  assert.equal(durationSec, 40);
  // На симуляторе событие JS пришло на 0:43, но файл длиной 40 с остаётся допустимым.
  assert.ok(43 > durationSec);
  assert.equal(recordingExceedsDurationLimit(durationSec, 40), false);
});

test('keeps fractional file duration for the server check', async () => {
  const status = { isLoaded: true, duration: 600.001, error: null };
  const durationSec = await recordedFileDurationSeconds(() => status);
  assert.equal(durationSec, 600.001);
  assert.equal(recordingExceedsDurationLimit(durationSec), true);
});

test('rounds only the draft label and keeps the recorded URI if duration loading fails', async () => {
  const good = await createStoppedRecordingDraft('file:///good.m4a', async () => 599.98, () => {
    throw new Error('unexpected failure');
  }, 41);
  assert.equal(good.durationSec, 600);
  assert.equal(good.uri, 'file:///good.m4a');

  const failure = new Error('player not ready');
  const reported = [];
  const saved = await createStoppedRecordingDraft('file:///saved.m4a', async () => {
    throw failure;
  }, (error) => reported.push(error), 42);
  assert.equal(saved.durationSec, 0);
  assert.equal(saved.uri, 'file:///saved.m4a');
  assert.deepEqual(reported, [failure]);
});

test('shows the file duration rounded to the nearest whole second', async () => {
  const report = () => { throw new Error('unexpected duration failure'); };
  const short = await createStoppedRecordingDraft('file:///short.m4a', async () => 39.3, report, 43);
  const long = await createStoppedRecordingDraft('file:///long.m4a', async () => 39.7, report, 44);
  assert.equal(short.durationSec, 39);
  assert.equal(long.durationSec, 40);
});

test('counts only whole recorded seconds', () => {
  assert.equal(recordedSeconds(0), 0);
  assert.equal(recordedSeconds(999), 0);
  assert.equal(recordedSeconds(1_000), 1);
  assert.equal(recordedSeconds(61_999), 61);
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
