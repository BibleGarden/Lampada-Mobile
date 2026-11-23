import '../lib/disableFontScaling';
import 'react-native-gesture-handler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
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
import { useSession } from '../lib/store';
import { useLock } from '../lib/lock';
import LockGate from '../components/LockGate';
import UpdateGate from '../components/UpdateGate';
import BootSplash from '../components/BootSplash';
import { screenReaderHiddenProps } from '../lib/a11y';
import { ScreenUncoveredContext } from '../lib/useVisibleScreen';
import { syncRemindersAsync } from '../lib/prayerReminderScheduler';
import { errorKind, recordDiagnostic } from '../lib/db';
import KeyboardSystemProvider from '../components/keyboard/KeyboardSystemProvider';

// Screens that must not be exited by an accidental action: the prayer flow
// ends only through explicit buttons. A reminder arriving during prayer
// does not pull the user out of it.
const PRAYER_FLOW = new Set(['/session', '/reflect']);

// The native splash is hidden once the BootSplash copy's flame is ready to
// render; the copy itself awaits the fonts and the UI language. Without this
// call expo-router would hide the splash as soon as navigation is ready,
// before the copy's flame. A rejection is a build defect and is fatal:
// RootLayout throws it (see fatalError).
const preventAutoHide = SplashScreen.preventAutoHideAsync();

/** Tapping a notification opens Home. */
function ReminderRouting() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      if (PRAYER_FLOW.has(pathnameRef.current)) return;
      // Settings opened from an active prayer (Bible selection) are part of its flow too.
      if (pathnameRef.current === '/settings' && useSession.getState().sessionId !== null) return;
      router.replace('/');
    });
    return () => sub.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  const uiLanguageReady = useSettings((state) => state.uiLanguageReady);
  const settingsLoaded = useSettings((state) => state.loaded);
  const uiLanguage = useSettings((state) => state.uiLanguage);

  // A startup failure (splash, settings, lock) must not be swallowed:
  // otherwise the app would silently hang on the splash or behind the lock
  // curtain. The promise error is re-thrown into render, which crashes the app.
  const [fatalError, setFatalError] = useState<unknown>(null);
  const failFatally = useCallback(
    (error: unknown) => setFatalError(() => error ?? new Error('Startup failed')),
    [],
  );
  useEffect(() => {
    preventAutoHide.catch(failFatally);
    useSettings.getState().load().catch(failFatally);
  }, [failFatally]);

  // On language change, replace the reminder text already stored in the system.
  useEffect(() => {
    if (!settingsLoaded) return;
    syncRemindersAsync(useSettings.getState().reminderSchedule).catch((error: unknown) => {
      // There is no screen here yet: settings will show the warning (useReminderSyncStatus).
      console.error('Failed to schedule prayer reminders', errorKind(error));
      recordDiagnostic('reminders_failed', { step: 'sync', place: 'startup', errorKind: errorKind(error) });
    });
  }, [settingsLoaded, uiLanguage]);

  // Lock state is read separately from settings and before them: until it
  // is known, LockGate keeps the curtain up and hides screen content.
  useEffect(() => {
    useLock.getState().load().catch(failFatally);
  }, [failFatally]);

  // The same "an overlay is on top" flag LockGate uses to decide what to
  // show. It is needed here too: the TalkBack marker is set not by the
  // overlay but by the content hidden beneath it (see lib/a11y).
  const lockReady = useLock((s) => s.ready);
  const locked = useLock((s) => s.locked);
  const obscured = useLock((s) => s.obscured);
  const covered = !lockReady || locked || obscured;

  const [fontsLoaded, fontError] = useFonts({
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

  // The app mounts only after the native splash is hidden: its heavy first
  // frame must not become the window's first frame (ADR-0040).
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const hideNativeSplash = useCallback(() => {
    SplashScreen.hide();
    setNativeSplashHidden(true);
  }, []);
  const ready = fontsLoaded && uiLanguageReady && nativeSplashHidden;
  const [bootSplashHidden, setBootSplashHidden] = useState(false);
  const hideBootSplash = useCallback(() => setBootSplashHidden(true), []);

  // Fonts are bundled into the build, so a font failure is a build defect.
  // The root layout exports no ErrorBoundary, so the error is fatal: the app
  // crashes with a failure report instead of hanging on the splash.
  if (fontError) throw fontError;
  if (fatalError) throw fatalError;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0e0a07' }}>
      <KeyboardSystemProvider>
        <StatusBar style="light" />
        <NavigationBar style="light" />
        {ready && <AppContent covered={covered} />}
        {!bootSplashHidden && (
          <BootSplash onFlameLoaded={hideNativeSplash} done={ready} onHidden={hideBootSplash} />
        )}
      </KeyboardSystemProvider>
    </GestureHandlerRootView>
  );
}

function AppContent({ covered }: { covered: boolean }) {
  const [updateVisible, setUpdateVisible] = useState(false);
  return (
    <>
      <ReminderRouting />
      {/* The wrapper exists only as the target of the screen reader marker:
           overlays are siblings of navigation, not its parent, so there is
           nowhere else to mark the content beneath them. It does not affect
           layout: flex: 1 and no styles beyond that. */}
      <ScreenUncoveredContext.Provider value={!covered && !updateVisible}>
        <View style={{ flex: 1 }} {...screenReaderHiddenProps(covered || updateVisible)}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0e0a07' },
              animation: 'fade',
              animationDuration: 350,
            }}
          >
            {/* session and reflection must not be exited by an accidental
                gesture: exit only via explicit buttons (finishEarly / completion) */}
            <Stack.Screen name="session" options={{ gestureEnabled: false }} />
            <Stack.Screen name="reflect" options={{ gestureEnabled: false }} />
          </Stack>
        </View>
      </ScreenUncoveredContext.Provider>
      {/* Last element, above all navigation: the lock screen and the privacy
          curtain must not be bypassed by navigation or deep links. */}
      <UpdateGate covered={covered} onVisibleChange={setUpdateVisible} />
      <LockGate />
    </>
  );
}
