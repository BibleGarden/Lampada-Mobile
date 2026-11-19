import assert from 'node:assert/strict';
import test from 'node:test';

import { IDLE_AUDIO_SOURCES, isAnswerAudioIdle, isAudioBusy, setAudioSourceBusy } from '../audioBusy.ts';

test('closing the answer sheet keeps music paused while narration still plays', () => {
  let state = setAudioSourceBusy(IDLE_AUDIO_SOURCES, 'scripture', true);
  state = setAudioSourceBusy(state, 'answer', true);
  state = setAudioSourceBusy(state, 'answer', false);
  assert.equal(isAudioBusy(state), true);
});

test('narration ending keeps music paused while the answer sheet still plays', () => {
  let state = setAudioSourceBusy(IDLE_AUDIO_SOURCES, 'answer', true);
  state = setAudioSourceBusy(state, 'scripture', false);
  assert.equal(isAudioBusy(state), true);
});

test('music resumes once every audio source is idle', () => {
  let state = setAudioSourceBusy(IDLE_AUDIO_SOURCES, 'scripture', true);
  state = setAudioSourceBusy(state, 'answer', true);
  state = setAudioSourceBusy(state, 'scripture', false);
  state = setAudioSourceBusy(state, 'answer', false);
  assert.equal(isAudioBusy(state), false);
  assert.equal(isAudioBusy(IDLE_AUDIO_SOURCES), false);
});

test('a late completion inside the answer sheet keeps the flag while another of its sounds is active', () => {
  const idle = { recordingPhase: 'idle', draftActive: false, cueActive: false };
  // Closing the answer sheet while a recording starts: the lease may already belong to the recording.
  assert.equal(isAnswerAudioIdle({ ...idle, recordingPhase: 'starting' }), false);
  // The limit signal finished while a new recording was starting.
  assert.equal(isAnswerAudioIdle({ ...idle, recordingPhase: 'recording' }), false);
  assert.equal(isAnswerAudioIdle({ ...idle, recordingPhase: 'stopping' }), false);
  assert.equal(isAnswerAudioIdle({ ...idle, draftActive: true }), false);
  assert.equal(isAnswerAudioIdle({ ...idle, cueActive: true }), false);
  assert.equal(isAnswerAudioIdle(idle), true);
});
