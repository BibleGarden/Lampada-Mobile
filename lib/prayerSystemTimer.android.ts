import { PermissionsAndroid, Platform } from 'react-native';
import PrayerTimerNotification from '../modules/prayer-timer-notification/src/PrayerTimerNotificationModule';
import type { PrayerSystemTimerState } from './prayerSystemTimer';

const notificationPermission =
  'android.permission.POST_NOTIFICATIONS' as PermissionsAndroid.Permission;
let operation: Promise<void> = Promise.resolve();

const enqueue = (work: () => Promise<void>) => {
  operation = operation.then(work, work);
  return operation;
};

const hasNotificationPermission = async (request: boolean) => {
  if (Platform.Version < 33) return true;
  if (await PermissionsAndroid.check(notificationPermission)) return true;
  if (!request) return false;
  return (
    (await PermissionsAndroid.request(notificationPermission)) ===
    PermissionsAndroid.RESULTS.GRANTED
  );
};

export function startPrayerSystemTimer(timer: PrayerSystemTimerState): Promise<void> {
  return enqueue(async () => {
    if (!(await hasNotificationPermission(true))) return;
    await PrayerTimerNotification.startCountdownAsync(timer.endsAtMs, 'Молитва');
  });
}

export function updatePrayerSystemTimer(timer: PrayerSystemTimerState): Promise<void> {
  return enqueue(async () => {
    if (!(await hasNotificationPermission(false))) return;
    await PrayerTimerNotification.startCountdownAsync(timer.endsAtMs, 'Молитва');
  });
}

export function stopPrayerSystemTimer(): Promise<void> {
  return enqueue(() => PrayerTimerNotification.stopCountdownAsync());
}
