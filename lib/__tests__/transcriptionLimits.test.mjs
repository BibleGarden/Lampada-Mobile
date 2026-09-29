import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_RECORDING_SECONDS,
  MAX_TRANSCRIPTION_BYTES,
  RECORDING_STOP_HEADROOM_SECONDS,
  recordingStopSeconds,
  recordingLimitReached,
  recordingLimitDisplay,
  recordingExceedsUploadLimit,
  recordingExceedsDurationLimit,
  recordingSecondsRemaining,
} from '../transcriptionLimits.ts';
import { answerComponentMessages } from '../locales/answerComponents.ts';
import { screenMessages } from '../locales/screens.ts';

test('the recording warning counts down to the actual stop point', () => {
  assert.equal(MAX_RECORDING_SECONDS, 600);
  assert.equal(recordingSecondsRemaining(538), null);
  assert.equal(recordingSecondsRemaining(539), 60);
  assert.equal(recordingSecondsRemaining(598), 1);
  assert.equal(recordingSecondsRemaining(599), 0);
  assert.equal(recordingSecondsRemaining(598, true), 0);
  assert.equal(recordingSecondsRemaining(600), 0);
  assert.equal(recordingSecondsRemaining(601), 0);
});

test('the native duration threshold reserves one second, and the server check stays fractional', () => {
  assert.equal(RECORDING_STOP_HEADROOM_SECONDS, 1);
  assert.equal(recordingStopSeconds(), 599);
  assert.equal(recordingStopSeconds(40), 39);
  assert.equal(recordingLimitReached(598_999), false);
  assert.equal(recordingLimitReached(599_000), true);
  assert.equal(recordingExceedsDurationLimit(39, 40), false);
  assert.equal(recordingExceedsDurationLimit(40, 40), false);
  assert.equal(recordingExceedsDurationLimit(40.02, 40), true);
  assert.equal(recordingExceedsDurationLimit(599.98), false);
  assert.equal(recordingExceedsDurationLimit(600.02), true);
  assert.equal(recordingExceedsDurationLimit(599), false);
  assert.equal(recordingExceedsDurationLimit(600), false);
  assert.equal(recordingExceedsDurationLimit(601), true);
  assert.throws(() => recordingLimitReached(-1), /invalid/);
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
  assert.throws(() => recordingExceedsDurationLimit(Number.NaN), /invalid/);
});
