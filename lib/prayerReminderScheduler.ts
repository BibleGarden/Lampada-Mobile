import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import {
  REMINDER_PHRASES,
  reminderWeeklyTriggers,
  shuffleReminderPhrases,
  type ReminderSchedule,
} from './prayerReminders';

// Планировщик локальных напоминаний поверх expo-notifications.
//
// Уведомления полностью локальные: push-токен не запрашивается и в момент
// срабатывания сеть не нужна. Система сама держит WEEKLY-триггеры, поэтому
// расписание переживает выгрузку приложения и перезагрузку устройства
// (expo-notifications добавляет RECEIVE_BOOT_COMPLETED на Android).
//
// Текст уходит в систему в момент планирования и на лету не подставляется —
// именно поэтому фразы перетасовываются при каждом полном перепланировании.

/**
 * Отдельный канал: ongoing-хронометр молитвы из
 * `modules/prayer-timer-notification` живёт в канале `twinkler_prayer_timer` и
 * с этим каналом не пересекается.
 */
export const REMINDER_CHANNEL_ID = 'prayer_reminders';

/**
 * Метка в `content.data`. Планировщик снимает только свои уведомления, поэтому
 * чужие запланированные уведомления (если они появятся) не пострадают.
 */
const REMINDER_KIND = 'prayer-reminder';

/**
 * Заголовок уведомления — имя приложения из конфигурации, а не строковая
 * константа: переименование приложения не должно требовать правки здесь.
 * Фраза идёт телом, потому что заголовок на iOS показывается одной строкой и
 * обрезается, а на несколько строк переносится именно тело.
 */
const appName = () => Constants.expoConfig?.name;

// Регистрируется на уровне модуля: без обработчика уведомление, пришедшее при
// открытом приложении, система молча отбрасывает.
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
  // На iOS осмысленный ответ даёт ios.status: provisional — это тоже разрешение,
  // просто тихая доставка.
  const granted =
    settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (granted) return 'granted';
  return settings.canAskAgain ? 'undetermined' : 'denied';
};

/**
 * Канал нужен и для маршрутизации уведомлений, и для того, чтобы на Android 13+
 * вообще появился системный запрос разрешения.
 */
export async function ensureReminderChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Напоминания о молитве',
    description: 'Тихое напоминание помолиться в выбранное время',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#e6a23c',
  });
}

/** Текущее состояние разрешения без системного запроса. */
export async function reminderPermissionAsync(): Promise<ReminderPermission> {
  try {
    return readPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/**
 * Системный запрос разрешения. Вызывается только в момент, когда пользователь
 * сам включает напоминания, а не при старте приложения.
 */
export async function requestReminderPermissionAsync(): Promise<ReminderPermission> {
  try {
    await ensureReminderChannelAsync();
    const current = await Notifications.getPermissionsAsync();
    const status = readPermission(current);
    if (status !== 'undetermined') return status;
    return readPermission(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      }),
    );
  } catch {
    return 'undetermined';
  }
}

/** Снимает все ранее запланированные напоминания этого приложения. */
export async function cancelRemindersAsync(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === REMINDER_KIND)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

/**
 * Полный переплан: сначала снимаем прежние уведомления, затем планируем набор
 * заново. Частичного обновления нет намеренно — так расписание в системе всегда
 * равно сохранённому, а фразы гарантированно меняются.
 *
 * @returns сколько уведомлений фактически запланировано.
 */
export async function rescheduleRemindersAsync(
  schedule: ReminderSchedule,
  random: () => number = Math.random,
): Promise<number> {
  await cancelRemindersAsync();
  const triggers = reminderWeeklyTriggers(schedule);
  if (triggers.length === 0) return 0;

  await ensureReminderChannelAsync();
  const phrases = shuffleReminderPhrases(REMINDER_PHRASES, random);
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
        // weekday здесь уже в нумерации expo-notifications: 1 = воскресенье.
        weekday: trigger.weekday,
        hour: trigger.hour,
        minute: trigger.minute,
      },
    });
  }
  return triggers.length;
}

/**
 * Приводит состояние системы в соответствие с сохранённым расписанием.
 * Вызывается при каждом запуске приложения и после каждой правки расписания.
 * Разрешение здесь не запрашивается: без выданного разрешения планировать
 * нечего, и запланированное снимается.
 */
export async function syncRemindersAsync(
  schedule: ReminderSchedule,
  random: () => number = Math.random,
): Promise<number> {
  try {
    if (!schedule.enabled) {
      await cancelRemindersAsync();
      return 0;
    }
    if ((await reminderPermissionAsync()) !== 'granted') {
      await cancelRemindersAsync();
      return 0;
    }
    return await rescheduleRemindersAsync(schedule, random);
  } catch {
    // Напоминания — вспомогательная функция: сбой планирования не должен
    // ломать запуск приложения или экран настроек.
    return 0;
  }
}
