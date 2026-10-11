import assert from 'node:assert/strict';
import test from 'node:test';
import { fitRecordingOverlay } from '../recordingOverlayGeometry.ts';

test('roomy sheets retain the original wave and gaps', () => {
  assert.deepEqual(fitRecordingOverlay(300, 100, 3, 24, 8, 48, 24), { gap: 24, waveHeight: 48 });
});

test('short sheets contract gaps before the wave', () => {
  assert.deepEqual(fitRecordingOverlay(200, 100, 3, 24, 8, 48, 24), { gap: 52 / 3, waveHeight: 48 });
  assert.deepEqual(fitRecordingOverlay(160, 100, 3, 24, 8, 48, 24), { gap: 8, waveHeight: 36 });
});

test('a very short sheet returns minimum sizes for scrolling', () => {
  assert.deepEqual(fitRecordingOverlay(120, 100, 3, 24, 8, 48, 24), { gap: 8, waveHeight: 24 });
});
