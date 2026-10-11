import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// expo-notifications подменён двойником: проверяется, что сбой системного
// планировщика не выдаётся за «планировать нечего».
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const stateUrl = data(`
  export const state = { granted: true, permissionError: null, scheduleError: null, scheduled: [] };
`);
const mocks = {
  './i18n': data('export const translate = (key) => key;'),
  './settings': data("export const useSettings = { getState: () => ({ uiLanguage: 'en' }) };"),
  'react-native': data("export const Platform = { OS: 'ios' };"),
  'expo-constants': data("export default { expoConfig: { name: 'Lampada' } };"),
  'expo-notifications': data(`
    import { state } from '${stateUrl}';
    export const setNotificationHandler = () => {};
    export const IosAuthorizationStatus = { PROVISIONAL: 3 };
    export const SchedulableTriggerInputTypes = { WEEKLY: 'weekly' };
    export const getPermissionsAsync = async () => {
      if (state.permissionError) throw state.permissionError;
      return { granted: state.granted, canAskAgain: true };
    };
    export const getAllScheduledNotificationsAsync = async () => state.scheduled;
    export const cancelScheduledNotificationAsync = async (id) => {
      state.scheduled = state.scheduled.filter((request) => request.identifier !== id);
    };
    export const scheduleNotificationAsync = async (request) => {
      if (state.scheduleError) throw state.scheduleError;
      state.scheduled.push({ identifier: String(state.scheduled.length), content: request.content });
    };
  `),
};
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/prayerReminderScheduler.ts')) {
      if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
      if (specifier.startsWith('./') && !specifier.endsWith('.ts')) {
        return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
});
const { reminderPermissionAsync, syncRemindersAsync, useReminderSyncStatus } = await import('../prayerReminderScheduler.ts');
const { state } = await import(stateUrl);

const schedule = { enabled: true, rules: [{ weekdays: [1, 2], times: [{ hour: 9, minute: 0 }] }] };
const reset = () => {
  state.granted = true;
  state.permissionError = null;
  state.scheduleError = null;
  state.scheduled = [];
  useReminderSyncStatus.setState({ failed: false });
};

test('a scheduling failure rejects instead of returning zero and marks the sync as failed', async () => {
  reset();
  state.scheduleError = new Error('alarm limit');
  await assert.rejects(syncRemindersAsync(schedule), /alarm limit/);
  assert.equal(useReminderSyncStatus.getState().failed, true);

  state.scheduleError = null;
  assert.equal(await syncRemindersAsync(schedule), 2);
  assert.equal(useReminderSyncStatus.getState().failed, false);
});

test('a permission check failure is an error, not an unanswered permission that cancels reminders', async () => {
  reset();
  state.scheduled = [{ identifier: 'kept', content: { data: { kind: 'prayer-reminder' } } }];
  state.permissionError = new Error('notification service down');
  await assert.rejects(reminderPermissionAsync());
  await assert.rejects(syncRemindersAsync(schedule));
  assert.deepEqual(state.scheduled.map((request) => request.identifier), ['kept']);
});

test('disabled reminders or a denied permission legitimately schedule nothing', async () => {
  reset();
  assert.equal(await syncRemindersAsync({ ...schedule, enabled: false }), 0);
  state.granted = false;
  assert.equal(await syncRemindersAsync(schedule), 0);
  assert.equal(useReminderSyncStatus.getState().failed, false);
});
