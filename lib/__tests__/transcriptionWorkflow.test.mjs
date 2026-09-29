import assert from 'node:assert/strict';
import test from 'node:test';

import { createStoppedRecordingDraft } from '../recordingFile.ts';
import { startPreparedRecording } from '../recordingOperation.ts';
import { createRecordingLimitController } from '../recordingLimitController.ts';
import { MAX_TRANSCRIPTION_BYTES } from '../transcriptionLimits.ts';
import { validateTranscriptionFile } from '../transcriptionPreflight.ts';
import { transcriptionFailureCode } from '../transcriptionErrors.ts';

test('recorded-time limit → file-backed draft → upload preflight accepts 599.98 seconds', async () => {
  let nativeRecording = false;
  let recordedMillis = 598_000;
  const recorder = {
    get isRecording() { return nativeRecording; },
    record() { nativeRecording = true; },
  };
  startPreparedRecording(recorder);
  let draftPromise;
  const controller = createRecordingLimitController(
    () => recordedMillis, () => nativeRecording, () => {
      nativeRecording = false;
      draftPromise = createStoppedRecordingDraft('file:///prayer.m4a', async () => 599.98,
        () => { throw new Error('duration unexpectedly failed'); }, 7);
    },
  );
  assert.equal(controller.poll(), false);
  recordedMillis = 599_000;
  assert.equal(controller.poll(), true);
  assert.equal(controller.poll(), false);
  const draft = await draftPromise;
  assert.equal(draft.uri, 'file:///prayer.m4a');
  assert.equal(draft.durationSec, 600);
  assert.equal(await validateTranscriptionFile(
    { exists: true, size: MAX_TRANSCRIPTION_BYTES }, async () => 599.98,
  ), 599.98);
});

test('the same path refuses a real 600.02-second file and an oversized file', async () => {
  await assert.rejects(
    validateTranscriptionFile({ exists: true, size: 3_000_000 }, async () => 600.02),
    (error) => transcriptionFailureCode(error) === 'too_long',
  );
  let durationReads = 0;
  await assert.rejects(
    validateTranscriptionFile({ exists: true, size: MAX_TRANSCRIPTION_BYTES + 1 }, async () => {
      durationReads += 1;
      return 599;
    }),
    (error) => transcriptionFailureCode(error) === 'too_long',
  );
  assert.equal(durationReads, 0);
});

test('a saved draft survives duration reader failure and can be checked again', async () => {
  const errors = [];
  const draft = await createStoppedRecordingDraft('file:///prayer.m4a', async () => {
    throw new Error('player did not load');
  }, (error) => errors.push(error), 8);
  assert.equal(draft.uri, 'file:///prayer.m4a');
  assert.equal(draft.durationSec, 0);
  assert.equal(errors.length, 1);
  assert.equal(await validateTranscriptionFile(
    { exists: true, size: 3_000_000 }, async () => 599.98,
  ), 599.98);
});
