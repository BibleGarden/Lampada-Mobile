import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Нативные модули и сторы подменены заглушками: проверяется только то, как
// ответ системного запроса биометрии превращается в результат для экрана.
// translate возвращает ключ, поэтому сообщение сверяется с ключом перевода.
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const mocks = {
  './i18n': data('export const translate = (key) => key;'),
  'react-native': data("export const Platform = { OS: 'ios' };"),
  'expo-secure-store': data('export {};'),
  'expo-crypto': data('export {};'),
  'expo-local-authentication': data(`
    export const calls = [];
    export const authenticateAsync = async (options) => {
      calls.push(options);
      return globalThis.biometricOutcome();
    };
  `),
  './db': data('export const wipeLocalData = async () => {};'),
  './prayerReminderScheduler': data('export const cancelRemindersAsync = async () => {};'),
  './settings': data('export const resetSettingsStore = () => {};'),
  './store': data('export const resetSessionStore = () => {};'),
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lock.ts')) {
      if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
      if (specifier.startsWith('./')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { authenticateWithBiometrics } = await import('../lock.ts');
const { calls } = await import(mocks['expo-local-authentication']);

const authenticate = (outcome) => {
  globalThis.biometricOutcome = outcome;
  return authenticateWithBiometrics('Unlock Lampada');
};

test('a successful prompt unlocks without a message', async () => {
  assert.deepEqual(await authenticate(() => ({ success: true })), { ok: true });
});

test('the native prompt offers the app PIN instead of the device passcode', async () => {
  calls.length = 0;
  await authenticate(() => ({ success: true }));
  assert.deepEqual(calls, [{
    promptMessage: 'Unlock Lampada',
    cancelLabel: 'system.enterPin',
    fallbackLabel: '',
    disableDeviceFallback: true,
  }]);
});

test('user, system and app cancellation is a silent return to the PIN pad', async () => {
  for (const error of ['user_cancel', 'system_cancel', 'app_cancel']) {
    assert.deepEqual(
      await authenticate(() => ({ success: false, error })),
      { ok: false, reason: 'cancelled' },
      error,
    );
  }
});

test('a rejected biometric match shows the authentication failure text', async () => {
  assert.deepEqual(
    await authenticate(() => ({ success: false, error: 'authentication_failed' })),
    { ok: false, reason: 'error', message: 'system.authFailed' },
  );
});

test('every other system error is shown in words', async () => {
  const expected = {
    not_enrolled: 'system.notEnrolled',
    not_available: 'system.notAvailable',
    passcode_not_set: 'system.noPasscode',
    lockout: 'system.lockout',
    timeout: 'system.timeout',
    unknown: 'system.authError',
    user_fallback: 'system.authError',
  };
  for (const [error, message] of Object.entries(expected)) {
    assert.deepEqual(
      await authenticate(() => ({ success: false, error })),
      { ok: false, reason: 'error', message },
      error,
    );
  }
});

test('a thrown prompt error becomes a shown error instead of being swallowed', async () => {
  assert.deepEqual(
    await authenticate(() => { throw new Error('Native module failed'); }),
    { ok: false, reason: 'error', message: 'system.authError' },
  );
  assert.deepEqual(
    await authenticate(() => { throw new Error('NSFaceIDUsageDescription: missing usage description'); }),
    { ok: false, reason: 'error', message: 'system.facePermission' },
  );
  assert.deepEqual(
    await authenticate(() => { throw 'not an Error'; }),
    { ok: false, reason: 'error', message: 'system.authError' },
  );
});

test.after(() => hooks.deregister());
