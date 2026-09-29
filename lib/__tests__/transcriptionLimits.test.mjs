import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_RECORDING_SECONDS,
  MAX_TRANSCRIPTION_BYTES,
  recordingLimitDisplay,
  recordingExceedsUploadLimit,
  recordingExceedsDurationLimit,
  recordingReachedLimit,
  recordingSecondsRemaining,
} from '../transcriptionLimits.ts';
import { answerComponentMessages } from '../locales/answerComponents.ts';
import { screenMessages } from '../locales/screens.ts';

test('the recording warning starts with one minute left and reaches zero at the server limit', () => {
  assert.equal(MAX_RECORDING_SECONDS, 600);
  assert.equal(recordingSecondsRemaining(539), null);
  assert.equal(recordingSecondsRemaining(540), 60);
  assert.equal(recordingSecondsRemaining(599), 1);
  assert.equal(recordingSecondsRemaining(600), 0);
  assert.equal(recordingSecondsRemaining(601), 0);
});

test('a terminal native status counts as the limit only near ten minutes', () => {
  assert.equal(recordingReachedLimit(null, 600_000), false);
  assert.equal(recordingReachedLimit(0, 597_999), false);
  assert.equal(recordingReachedLimit(0, 598_000), true);
  assert.equal(recordingReachedLimit(0, 600_000), true);
});

test('a delayed completion does not relax the strict duration check', () => {
  assert.equal(recordingReachedLimit(0, 37_999, 40), false);
  assert.equal(recordingReachedLimit(0, 43_000, 40), true);
  assert.equal(recordingExceedsDurationLimit(39, 40), false);
  assert.equal(recordingExceedsDurationLimit(40, 40), false);
  assert.equal(recordingExceedsDurationLimit(43, 40), true);
  assert.equal(recordingExceedsDurationLimit(599), false);
  assert.equal(recordingExceedsDurationLimit(600), false);
  assert.equal(recordingExceedsDurationLimit(601), true);
});

test('the limit message uses localized human duration and correct plural forms', () => {
  const message = (language, seconds) => {
    const { count, unitKey } = recordingLimitDisplay(seconds, language);
    const unit = { ...screenMessages[language], ...answerComponentMessages[language] }[unitKey];
    assert.ok(unit);
    return answerComponentMessages[language]['components.answers.recordingLimitReached']
      .replace('{limit}', `${count} ${unit}`);
  };
  assert.match(message('en', 600), /10 minutes/);
  assert.match(message('ru', 600), /10 минут/);
  assert.match(message('uk', 600), /10 хвилин/);
  assert.match(message('ru', 60), /1 минута/);
  assert.match(message('ru', 120), /2 минуты/);
  assert.match(message('uk', 240), /4 хвилини/);
  assert.match(message('uk', 300), /5 хвилин/);
  assert.match(message('ru', 40), /40 секунд/);
  assert.match(message('uk', 41), /41 секунда/);
  assert.match(message('en', 40), /40 seconds/);
});

test('the upload accepts the server maximum and rejects larger legacy files', () => {
  assert.equal(MAX_TRANSCRIPTION_BYTES, 14 * 1024 * 1024);
  assert.equal(recordingExceedsUploadLimit(MAX_TRANSCRIPTION_BYTES), false);
  assert.equal(recordingExceedsUploadLimit(MAX_TRANSCRIPTION_BYTES + 1), true);
  assert.equal(recordingExceedsDurationLimit(600), false);
  assert.equal(recordingExceedsDurationLimit(601), true);
  assert.equal(recordingExceedsDurationLimit(undefined), false);
});
