import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Нативные границы lib/lock подменены: проверяется, что сбои SecureStore и
// системных напоминаний не теряются молча.
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const stateUrl = data(`
  export const state = {
    secure: new Map(), readError: null, deleteError: null, remindersError: null,
    wiped: 0, diagnostics: [],
  };
`);
const mocks = {
  './i18n': data('export const translate = (key) => key;'),
  'react-native': data("export const Platform = { OS: 'ios' };"),
  'expo-secure-store': data(`
    import { state } from '${stateUrl}';
    export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'device-only';
    export const getItemAsync = async (key) => {
      if (state.readError) throw state.readError;
      return state.secure.get(key) ?? null;
    };
    export const setItemAsync = async (key, value) => { state.secure.set(key, value); };
    export const deleteItemAsync = async (key) => {
      if (state.deleteError) throw state.deleteError;
      state.secure.delete(key);
    };
  `),
  'expo-crypto': data('export {};'),
  'expo-local-authentication': data('export {};'),
  './db': data(`
    import { state } from '${stateUrl}';
    export const wipeLocalData = async () => { state.wiped += 1; state.diagnostics.length = 0; };
    export const recordDiagnostic = (event, details) => state.diagnostics.push([event, details]);
    export const errorKind = (error) => (error instanceof Error ? 'error' : typeof error);
  `),
  './prayerReminderScheduler': data(`
    import { state } from '${stateUrl}';
    export const cancelRemindersAsync = async () => { if (state.remindersError) throw state.remindersError; };
  `),
  './settings': data('export const resetSettingsStore = () => {};'),
  './store': data('export const resetSessionStore = () => {};'),
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lock.ts')) {
      if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
      if (specifier.startsWith('./')) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { disableLock, readLockConfig, useLock, wipeEverything } = await import('../lock.ts');
const { state } = await import(stateUrl);

const reset = () => {
  state.secure = new Map([['lampada.lock.enabled', '1'], ['lampada.lock.hash', 'h']]);
  state.readError = null;
  state.deleteError = null;
  state.remindersError = null;
  state.wiped = 0;
  state.diagnostics.length = 0;
};

test('an unreadable SecureStore still opens the app, but the failure is recorded without values', async () => {
  reset();
  state.readError = new Error('keychain locked');
  assert.equal((await readLockConfig()).enabled, false);
  assert.equal(state.diagnostics.length, 5);
  assert.deepEqual(state.diagnostics[0], ['secure_store_failed', {
    operation: 'read', key: 'lampada.lock.enabled', errorKind: 'error',
  }]);
});

test('a failed key deletion is not swallowed: the lock stays on and the failure is recorded', async () => {
  reset();
  useLock.setState({ enabled: true });
  state.deleteError = new Error('keystore unavailable');
  await assert.rejects(disableLock());
  assert.equal(useLock.getState().enabled, true);
  assert.ok(state.diagnostics.every(([event, details]) => event === 'secure_store_failed' && details.operation === 'delete'));
});

test('the wipe finishes when reminders cannot be cancelled and reports the incomplete step', async () => {
  reset();
  state.remindersError = new Error('notifications unavailable');
  assert.deepEqual(await wipeEverything(), { remindersCancelled: false });
  assert.equal(state.wiped, 1);
  assert.equal(state.secure.size, 0);
  assert.deepEqual(state.diagnostics, [['wipe_incomplete', { step: 'reminders', errorKind: 'error' }]]);
});

test('a complete wipe reports cancelled reminders and records nothing', async () => {
  reset();
  assert.deepEqual(await wipeEverything(), { remindersCancelled: true });
  assert.deepEqual(state.diagnostics, []);
});
