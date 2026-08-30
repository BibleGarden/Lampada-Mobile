import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_PIN_LENGTH,
  LOCK_GRACE_MS,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  isValidPin,
  parseLockConfig,
  shouldLockAfterBackground,
} from '../lockPolicy.ts';

// ---- окно возврата из фона ----

test('locks once the background interval reaches the grace window', () => {
  assert.equal(shouldLockAfterBackground(1_000, 1_000 + LOCK_GRACE_MS), true);
  assert.equal(shouldLockAfterBackground(0, 60_000), true);
});

test('keeps a short trip to the background unlocked', () => {
  assert.equal(shouldLockAfterBackground(0, 59_999), false);
});

test('locks after a longer background interval', () => {
  assert.equal(shouldLockAfterBackground(0, 60_001), true);
  assert.equal(shouldLockAfterBackground(1_000, 61_001), true);
});

test('never locks when the app has not been backgrounded', () => {
  assert.equal(shouldLockAfterBackground(null, 0), false);
  assert.equal(shouldLockAfterBackground(null, Number.MAX_SAFE_INTEGER), false);
});

test('keeps a zero-length background interval unlocked', () => {
  assert.equal(shouldLockAfterBackground(5_000, 5_000), false);
});

// ---- допустимость пина ----

test('accepts digit-only pins of the allowed length', () => {
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('12345678'), true);
});

test('rejects pins that are too short or too long', () => {
  assert.equal(isValidPin('123'), false);
  assert.equal(isValidPin('123456789'), false);
  assert.equal(isValidPin(''), false);
});

test('rejects pins containing anything but digits', () => {
  assert.equal(isValidPin('12a4'), false);
  assert.equal(isValidPin('1234 '), false);
  assert.equal(isValidPin('+1234567'), false);
});

// В отличие от Perl и Python, `$` без флага `m` в JS матчится только в самом
// конце строки и не пропускает завершающий перевод строки. Тест закрепляет
// это: любой \n делает пин недопустимым, и правило не поедет при правке
// регулярки.
test('rejects a pin with a newline at either end', () => {
  assert.equal(isValidPin('1234\n'), false);
  assert.equal(isValidPin('\n1234'), false);
  assert.equal(isValidPin('1234\n5'), false);
});

// ---- разбор хранимой конфигурации ----

const raw = (over = {}) => ({
  enabled: null,
  hash: null,
  salt: null,
  biometrics: null,
  length: null,
  ...over,
});

test('treats an enabled flag without a hash as disabled', () => {
  assert.equal(parseLockConfig(raw({ enabled: '1', salt: 's' })).enabled, false);
});

test('treats an enabled flag without a salt as disabled', () => {
  assert.equal(parseLockConfig(raw({ enabled: '1', hash: 'h' })).enabled, false);
});

test('treats a stored hash and salt without the flag as disabled', () => {
  assert.equal(parseLockConfig(raw({ hash: 'h', salt: 's' })).enabled, false);
});

test('enables the lock only for a complete record', () => {
  assert.deepEqual(parseLockConfig(raw({ enabled: '1', hash: 'h', salt: 's' })), {
    enabled: true,
    biometrics: false,
    pinLength: FALLBACK_PIN_LENGTH,
  });
});

test('ignores biometrics while the lock itself is off', () => {
  assert.equal(parseLockConfig(raw({ enabled: '1', biometrics: '1' })).biometrics, false);
});

test('reports biometrics on top of an enabled lock', () => {
  const config = parseLockConfig(raw({ enabled: '1', hash: 'h', salt: 's', biometrics: '1' }));
  assert.equal(config.biometrics, true);
});

test('keeps the stored pin length', () => {
  assert.equal(parseLockConfig(raw({ length: '6' })).pinLength, 6);
});

test('falls back to the minimum length for an unreadable record', () => {
  assert.equal(parseLockConfig(raw({ length: 'abc' })).pinLength, FALLBACK_PIN_LENGTH);
  assert.equal(parseLockConfig(raw({ length: null })).pinLength, FALLBACK_PIN_LENGTH);
  assert.equal(parseLockConfig(raw({ length: '' })).pinLength, FALLBACK_PIN_LENGTH);
  assert.equal(FALLBACK_PIN_LENGTH, 4);
});

test('clamps an out-of-range stored length to the allowed bounds', () => {
  assert.equal(parseLockConfig(raw({ length: '2' })).pinLength, PIN_MIN_LENGTH);
  assert.equal(parseLockConfig(raw({ length: '99' })).pinLength, PIN_MAX_LENGTH);
});
