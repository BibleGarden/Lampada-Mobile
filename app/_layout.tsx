import 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Spectral_300Light,
  Spectral_300Light_Italic,
  Spectral_400Regular,
  Spectral_600SemiBold,
} from '@expo-google-fonts/spectral';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import { useSettings } from '../lib/settings';
import { useLock } from '../lib/lock';
import LockGate from '../components/LockGate';
import { screenReaderHiddenProps } from '../lib/a11y';
import { syncRemindersAsync } from '../lib/prayerReminderScheduler';

// Экраны, из которых нельзя выпасть случайным действием: молитвенный сценарий
// завершается только явными кнопками. Напоминание, пришедшее во время молитвы,
// не выбрасывает пользователя из неё.
const PRAYER_FLOW = new Set(['/session', '/reflect', '/done']);

/** Тап по напоминанию открывает главную. */
function ReminderRouting() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      if (PRAYER_FLOW.has(pathnameRef.current)) return;
      router.replace('/');
    });
    return () => sub.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  // настройки нужны до первой генерации вопросов — грузим при старте
  useEffect(() => {
    // Полный переплан при каждом запуске: текст уведомления уносится в систему
    // в момент планирования, поэтому фразы обновляются только так.
    (async () => {
      await useSettings.getState().load();
      await syncRemindersAsync(useSettings.getState().reminderSchedule);
    })().catch(() => undefined);
  }, []);

  // Состояние блокировки читается отдельно от настроек и раньше них: пока оно
  // неизвестно, LockGate держит шторку и не показывает содержимое экранов.
  useEffect(() => {
    void useLock.getState().load().catch(() => undefined);
  }, []);

  // Тот же признак «сверху висит оверлей», по которому LockGate решает, что
  // показывать. Он нужен и здесь: пометку для TalkBack ставит не оверлей, а
  // скрываемый под ним контент (см. lib/a11y).
  const lockReady = useLock((s) => s.ready);
  const locked = useLock((s) => s.locked);
  const obscured = useLock((s) => s.obscured);
  const covered = !lockReady || locked || obscured;

  const [fontsLoaded] = useFonts({
    Spectral_300Light,
    Spectral_300Light_Italic,
    Spectral_400Regular,
    Spectral_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0e0a07' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0e0a07' }}>
      <StatusBar style="light" />
      <ReminderRouting />
      {/* Обёртка нужна только как адресат пометки для TalkBack: оверлеи —
          сиблинги навигации, а не её родитель, и пометить содержимое под ними
          больше неоткуда. Раскладку она не трогает: flex: 1 и никаких стилей
          сверх него. */}
      <View style={{ flex: 1 }} {...screenReaderHiddenProps(covered)}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0e0a07' },
            animation: 'fade',
            animationDuration: 350,
          }}
        >
          {/* из сессии и рефлексии нельзя выпасть случайным жестом:
              выход — только явными кнопками (finishEarly / завершение) */}
          <Stack.Screen name="session" options={{ gestureEnabled: false }} />
          <Stack.Screen name="reflect" options={{ gestureEnabled: false }} />
          <Stack.Screen name="done" options={{ gestureEnabled: false }} />
        </Stack>
      </View>
      {/* Последним элементом, поверх всей навигации: экран блокировки и шторку
          приватности нельзя обойти ни переходом, ни диплинком. */}
      <LockGate />
    </GestureHandlerRootView>
  );
}
