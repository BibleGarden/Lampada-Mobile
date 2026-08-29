import { NativeModule, requireNativeModule } from 'expo';

declare class PrayerTimerNotificationModule extends NativeModule<{}> {
  startCountdownAsync(endsAtMs: number, title: string): Promise<void>;
  stopCountdownAsync(): Promise<void>;
}

export default requireNativeModule<PrayerTimerNotificationModule>('PrayerTimerNotification');
