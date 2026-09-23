import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PRAYER_MINUTES,
  MAX_PRAYER_MINUTES,
  parseStoredPrayerMinutes,
  serializePrayerMinutes,
} from '../prayerDuration.ts';

test('first launch without a stored duration keeps the default', () => {
  assert.equal(parseStoredPrayerMinutes(null), DEFAULT_PRAYER_MINUTES);
});

test('presets, stepper values and the untimed prayer survive a round trip', () => {
  for (const minutes of [0, 1, 4, 15, 35, 60, MAX_PRAYER_MINUTES]) {
    assert.equal(parseStoredPrayerMinutes(serializePrayerMinutes(minutes)), minutes);
  }
});

test('an out-of-range or non-integer duration is refused on save', () => {
  for (const minutes of [-1, MAX_PRAYER_MINUTES + 1, 2.5, Number.NaN]) {
    assert.throws(() => serializePrayerMinutes(minutes), /Invalid prayer duration/);
  }
});

test('a corrupted stored duration fails loudly instead of falling back', () => {
  for (const value of ['', 'abc', '-5', '1.5', ' 15', '121']) {
    assert.throws(() => parseStoredPrayerMinutes(value), /Invalid stored prayer duration/);
  }
});
