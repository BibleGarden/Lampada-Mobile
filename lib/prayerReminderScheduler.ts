import { create } from 'zustand';
import { translate } from './i18n';
import { useSettings } from './settings';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import {
  reminderPhrases,
  reminderWeeklyTriggers,
  shuffleReminderPhrases,
  type ReminderSchedule,
} from './prayerReminders';

// Local reminder scheduler on top of expo-notifications.
//
// The notifications are fully local: no push token is requested and no network
// is needed at fire time. The OS keeps the WEEKLY triggers itself, so the
// schedule survives app eviction and device reboots (expo-notifications adds
// RECEIVE_BOOT_COMPLETED on Android).
//
// The text is handed to the OS at scheduling time and cannot be swapped on the
// fly — which is why the phrases are shuffled on every full reschedule.

/**
 * A separate channel: the ongoing prayer stopwatch from
 * `modules/prayer-timer-notification` lives in the `twinkler_prayer_timer`
 * channel and never intersects this one.
 */
export const REMINDER_CHANNEL_ID = 'prayer_reminders';

/**
 * A marker in `content.data`. The scheduler cancels only its own notifications,
 * so foreign scheduled notifications (should any appear) stay untouched.
 */
const REMINDER_KIND = 'prayer-reminder';

/**
 * The notification title is the app name from the config, not a string
 * constant: renaming the app must not require an edit here. The phrase goes
 * into the body because iOS renders the title as a single truncated line,
 * while it is the body that wraps to multiple lines.
 */
const appName = () => Constants.expoConfig?.name;

// Registered at module level: without a handler, the OS silently drops
// notifications that arrive while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

const readPermission = (settings: Notifications.NotificationPermissionsStatus): ReminderPermission => {
  // On iOS the meaningful answer is ios.status: provisional — that is also a
  // grant, just with silent delivery.
  const granted =
    settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (granted) return 'granted';
  return settings.canAskAgain ? 'undetermined' : 'denied';
};

/**
 * The channel is needed both to route notifications and for the Android 13+
 * system permission prompt to appear at all.
 */
export async function ensureReminderChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: translate('system.reminderChannel'),
    description: translate('system.reminderDescription'),
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#e6a23c',
  });
}

/**
 * Current permission state without a system prompt. A failing system call
 * rejects the promise: masking it as "never asked" would strip reminders from
 * someone who granted them.
 */
export async function reminderPermissionAsync(): Promise<ReminderPermission> {
  return readPermission(await Notifications.getPermissionsAsync());
}

/**
 * System permission prompt. Called only at the moment the user enables
 * reminders themselves, not at app startup.
 */
export async function requestReminderPermissionAsync(): Promise<ReminderPermission> {
  await ensureReminderChannelAsync();
  const current = await Notifications.getPermissionsAsync();
  const status = readPermission(current);
  if (status !== 'undetermined') return status;
  return readPermission(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    }),
  );
}

/** Cancels all previously scheduled reminders of this app. */
export async function cancelRemindersAsync(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === REMINDER_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

/**
 * Full replan: cancel the previous notifications first, then schedule the set
 * from scratch. Partial updates are deliberate non-existent — this way the
 * system schedule always equals the stored one, and the phrases are guaranteed
 * to change.
 *
 * @returns how many notifications were actually scheduled.
 */
export async function rescheduleRemindersAsync(
  schedule: ReminderSchedule,
  random: () => number = Math.random,
): Promise<number> {
  await cancelRemindersAsync();
  const triggers = reminderWeeklyTriggers(schedule);
  if (triggers.length === 0) return 0;

  await ensureReminderChannelAsync();
  const phrases = shuffleReminderPhrases(reminderPhrases(useSettings.getState().uiLanguage), random);
  const title = appName();

  for (let index = 0; index < triggers.length; index += 1) {
    const trigger = triggers[index];
    await Notifications.scheduleNotificationAsync({
      content: {
        ...(title ? { title } : {}),
        body: phrases[index % phrases.length],
        sound: true,
        data: { kind: REMINDER_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        channelId: REMINDER_CHANNEL_ID,
        // weekday is already in expo-notifications numbering here: 1 = Sunday.
        weekday: trigger.weekday,
        hour: trigger.hour,
        minute: trigger.minute,
      },
    });
  }
  return triggers.length;
}

/**
 * Brings the system state in line with the stored schedule. Called on every
 * app launch and after every schedule edit. No permission is requested here:
 * without a grant there is nothing to schedule, and anything scheduled is
 * cancelled. A scheduler failure rejects the promise so it cannot be confused
 * with "nothing to schedule" (0).
 */
async function synchronizeRemindersAsync(
  schedule: ReminderSchedule,
  random: () => number,
): Promise<number> {
  if (!schedule.enabled || (await reminderPermissionAsync()) !== 'granted') {
    await cancelRemindersAsync();
    return 0;
  }
  return rescheduleRemindersAsync(schedule, random);
}

/**
 * Outcome of the last system sync. Sync runs off-screen too (at launch), so
 * its failure is stored here and shown in settings.
 */
export const useReminderSyncStatus = create<{ failed: boolean }>(() => ({ failed: false }));

let syncOperation: Promise<number> = Promise.resolve(0);
export function syncRemindersAsync(
  schedule: ReminderSchedule,
  random: () => number = Math.random,
): Promise<number> {
  const run = () => synchronizeRemindersAsync(schedule, random).then(
    (count) => {
      useReminderSyncStatus.setState({ failed: false });
      return count;
    },
    (error: unknown) => {
      useReminderSyncStatus.setState({ failed: true });
      throw error;
    },
  );
  syncOperation = syncOperation.then(run, run);
  return syncOperation;
}
