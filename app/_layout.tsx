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
    </GestureHandlerRootView>
  );
}
