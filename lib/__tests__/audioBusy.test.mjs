import assert from 'node:assert/strict';
import test from 'node:test';

import { IDLE_AUDIO_SOURCES, isAudioBusy, setAudioSourceBusy } from '../audioBusy.ts';

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
