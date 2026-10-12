import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// Нативные границы lib/lock подменены: проверяется, что сбои SecureStore и
// системных напоминаний не теряются молча.
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const stateUrl = data(`
  export const state = {
    secure: new Map(), readError: null, deleteError: null, deleteErrorKey: null, remindersError: null,
    wiped: 0, wipeError: null, hasData: true, diagnostics: [], settingsResets: 0, sessionResets: 0, actions: [],
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
      state.actions.push('delete:' + key);
      if (state.deleteError && (state.deleteErrorKey === null || state.deleteErrorKey === key)) throw state.deleteError;
      state.secure.delete(key);
    };
  `),
  'expo-crypto': data('export {};'),
  'expo-local-authentication': data('export {};'),
  './db': data(`
    import { state } from '${stateUrl}';
    export const wipeLocalData = async () => {
      state.actions.push('wipe');
      if (state.wipeError) throw state.wipeError;
      state.hasData = false;
      state.wiped += 1;
      state.diagnostics.length = 0;
    };
    export const recordDiagnostic = (event, details) => state.diagnostics.push([event, details]);
    export const errorKind = (error) => (error instanceof Error ? 'error' : typeof error);
  `),
  './prayerReminderScheduler': data(`
    import { state } from '${stateUrl}';
    export const cancelRemindersAsync = async () => {
      state.actions.push('reminders');
      if (state.remindersError) throw state.remindersError;
    };
  `),
  './settings': data(`import { state } from '${stateUrl}'; export const resetSettingsStore = () => { state.settingsResets += 1; };`),
  './store': data(`import { state } from '${stateUrl}'; export const resetSessionStore = () => { state.sessionResets += 1; };`),
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
  state.secure = new Map([
    ['lampada.lock.enabled', '1'], ['lampada.lock.hash', 'h'], ['lampada.lock.salt', 's'],
    ['lampada.lock.length', '6'], ['lampada.lock.biometrics', '0'],
  ]);
  state.readError = null;
  state.deleteError = null;
  state.deleteErrorKey = null;
  state.remindersError = null;
  state.wiped = 0;
  state.wipeError = null;
  state.hasData = true;
  state.settingsResets = 0;
  state.sessionResets = 0;
  state.diagnostics.length = 0;
  state.actions.length = 0;
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

test('a data-wipe failure preserves data, secure keys and the lock until a successful retry', async () => {
  reset();
  useLock.setState({ enabled: true, locked: true });
  const lockBefore = useLock.getState();
  const secureBefore = new Map(state.secure);
  state.wipeError = new Error('database is busy');
  await assert.rejects(wipeEverything(), /database is busy/);
  assert.equal(state.hasData, true);
  assert.equal(state.wiped, 0);
  assert.equal(state.settingsResets, 0);
  assert.equal(state.sessionResets, 0);
  assert.equal(useLock.getState().enabled, true);
  assert.equal(useLock.getState().locked, true);
  assert.equal(useLock.getState(), lockBefore);
  assert.deepEqual(state.actions, ['wipe']);
  assert.deepEqual(state.secure, secureBefore);
  assert.equal((await readLockConfig()).enabled, true);
  state.wipeError = null;
  assert.deepEqual(await wipeEverything(), { remindersCancelled: true });
  assert.equal(state.hasData, false);
  assert.equal(state.secure.size, 0);
  assert.equal(useLock.getState().enabled, false);
  assert.equal(useLock.getState().locked, false);
});

for (const key of ['lampada.lock.enabled', 'lampada.lock.hash']) {
  test(`failure to delete ${key} resets wiped stores but keeps the lock screen for a retry that completes`, async () => {
    reset();
    useLock.setState({ enabled: true, locked: true });
    state.deleteError = new Error('keystore unavailable');
    state.deleteErrorKey = key;
    await assert.rejects(wipeEverything());
    assert.equal(state.hasData, false);
    assert.equal(state.wiped, 1);
    assert.equal(state.settingsResets, 1);
    assert.equal(state.sessionResets, 1);
    assert.equal(useLock.getState().enabled, true);
    assert.equal(useLock.getState().locked, true);
    assert.deepEqual(state.actions.slice(0, 2), ['wipe', 'reminders']);
    assert.equal(state.secure.has(key), true);
    state.deleteError = null;
    assert.deepEqual(await wipeEverything(), { remindersCancelled: true });
    assert.equal(state.wiped, 2);
    assert.equal(state.settingsResets, 2);
    assert.equal(state.sessionResets, 2);
    assert.equal(state.secure.size, 0);
    assert.equal(useLock.getState().enabled, false);
    assert.equal(useLock.getState().locked, false);
    assert.equal((await readLockConfig()).enabled, false);
  });
}

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
