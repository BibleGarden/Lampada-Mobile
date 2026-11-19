import { useI18n } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import ScreenBg from './ScreenBg';
import PinPad from './PinPad';
import { Lamp } from './icons';
import { colors, column, fonts, sc, useStyles } from '../lib/theme';
import { useSettings } from '../lib/settings';
import { errorKind, recordDiagnostic } from '../lib/db';
import {
  authenticateWithBiometrics,
  biometryInfo,
  biometryText,
  useLock,
  verifyPin,
  wipeEverything,
  type BiometryInfo,
} from '../lib/lock';

// Lock gate. Lives in the root layout above the Stack, not as a separate
// route: any screen reachable by navigation can also be bypassed — via a
// deeplink, back navigation, or a notification. An overlay over the whole
// navigation cannot be bypassed.

const APP_NAME = 'Lampada';

/**
 * Privacy curtain. Shown while the app is inactive so the snapshot in the app
 * switcher does not capture the open diary, and while the protection config is
 * not yet loaded — before that it is unknown whether content may be shown at all.
 *
 * `accessibilityViewIsModal` is not cosmetic: covering pixels hides content
 * only from eyes and touches. VoiceOver walks the accessibility tree, not the
 * screen, and without this flag it would read the diary under the curtain aloud.
 */
function PrivacyCurtain() {
  const styles = useStyles(stylesFactory);
  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="privacy-curtain">
      <ScreenBg />
      <View style={styles.curtainCenter}>
        <Lamp size={44} />
        <Text style={styles.curtainName}>{APP_NAME}</Text>
      </View>
    </View>
  );
}

function LockScreen() {
  const { t, language } = useI18n();
  const styles = useStyles(stylesFactory);
  const pinLength = useLock((s) => s.pinLength);
  const biometricsOn = useLock((s) => s.biometrics);
  const unlock = useLock((s) => s.unlock);
  const [biometry, setBiometry] = useState<BiometryInfo | null>(null);
  const [wiping, setWiping] = useState(false);
  // A biometry error (not a cancellation) on the lock screen. Not shown as an
  // Alert: the automatic prompt on every appearance would spam the user with
  // it — instead the hint under the pin pad explains why Face ID failed.
  const [biometryError, setBiometryError] = useState<string | null>(null);
  // The automatic prompt runs once per screen appearance. The system Face ID
  // sheet itself makes the app inactive, and without this flag returning from
  // it would trigger the prompt again — an endless loop.
  const autoPrompted = useRef(false);

  const runBiometrics = async () => {
    setBiometryError(null);
    const result = await authenticateWithBiometrics(t('components.security.unlockApp', { name: APP_NAME }));
    if (result.ok) {
      unlock();
      return;
    }
    // A cancellation (including a backgrounded auto-prompt) is no reason to say
    // anything: the person already sees the pin pad and can use it.
    if (result.reason === 'error') setBiometryError(result.message);
  };

  useEffect(() => {
    if (!biometricsOn) return;
    let alive = true;
    void biometryInfo().then((info) => {
      if (!alive) return;
      setBiometry(info);
      // Enrollments may have been removed in the system after the toggle was
      // enabled: only the pin remains then, and offering biometry is pointless.
      if (!info.available || autoPrompted.current) return;
      autoPrompted.current = true;
      void runBiometrics();
    });
    return () => {
      alive = false;
    };
  }, [biometricsOn, language]);

  const submitPin = async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) unlock();
    return ok ? null : t('components.security.incorrectPin');
  };

  const runWipe = async () => {
    setWiping(true);
    try {
      const { remindersCancelled } = await wipeEverything();
      // Settings reload as on a fresh install: the database is recreated by a
      // migration on first access. On failure, screens retry loading via
      // ensureSettingsLoaded.
      useSettings.getState().load().catch((error: unknown) => {
        console.error('Failed to reload settings after the wipe', errorKind(error));
        recordDiagnostic('settings_load_failed', { place: 'after_wipe', errorKind: errorKind(error) });
      });
      router.replace('/');
      if (!remindersCancelled) {
        Alert.alert(
          t('components.security.wipeRemindersFailed'),
          t('components.security.wipeRemindersFailedHint'),
        );
      }
    } catch {
      // The wipe failed — protection stays enabled, and the user must see that
      // instead of facing a screen that "did nothing".
      Alert.alert(
        t('components.security.wipeError'),
        t('components.security.wipeErrorHint'),
      );
    } finally {
      setWiping(false);
    }
  };

  // Two confirmations in a row: the wipe is irreversible, and an accidental tap
  // on the link under the keyboard must not cost the person their whole diary.
  const askWipe = () => {
    Alert.alert(
      t('components.security.forgotPin'),
      t('components.security.forgotPinDetails'),
      [
        { text: t('components.security.cancel'), style: 'cancel' },
        { text: t('components.security.eraseData'), style: 'destructive', onPress: confirmWipe },
      ],
    );
  };

  const confirmWipe = () => {
    Alert.alert(
      t('components.security.confirmErase'),
      t('components.security.eraseDetails'),
      [
        { text: t('components.security.cancel'), style: 'cancel' },
        { text: t('components.security.yesErase'), style: 'destructive', onPress: () => void runWipe() },
      ],
    );
  };

  const canUseBiometry = biometricsOn && !!biometry?.available;

  // Modality for VoiceOver is mandatory for exactly the same reason as for the
  // curtain: a locked app must be neither readable nor activated by gestures
  // bypassing the overlay.
  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="lock-screen">
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(320)} style={styles.lockScreen}>
        <PinPad
          title={t('components.security.enterPin')}
          titleTestID="lock-pin-title"
          subtitle={
            canUseBiometry
              ? biometryError ?? biometryText(Platform.OS, biometry?.kind ?? 'other', 'orUnlock', t)
              : t('components.security.pinProtected')
          }
          expectedLength={pinLength}
          onSubmit={submitPin}
          biometry={
            canUseBiometry && biometry
              ? { label: biometryText(Platform.OS, biometry.kind, 'unlock', t), onPress: () => void runBiometrics() }
              : null
          }
          footer={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('components.security.forgotPin')}
              testID="forgot-pin"
              disabled={wiping}
              onPress={askWipe}
              hitSlop={8}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.forgot}>{t('components.security.forgotPin')}</Text>
            </Pressable>
          }
        />
      </Animated.View>
    </View>
  );
}

/**
 * The single point where the app decides whether to show content. The AppState
 * subscription lives here too: the focused subscriptions of other screens
 * (settings, session) run independently and do not interfere with it.
 */
export default function LockGate() {
  const ready = useLock((s) => s.ready);
  const locked = useLock((s) => s.locked);
  const obscured = useLock((s) => s.obscured);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const lock = useLock.getState();
      if (state === 'active') lock.noteActive();
      else if (state === 'background') lock.noteBackground();
      else lock.noteInactive();
    });
    return () => sub.remove();
  }, []);

  // Content is not shown before the config is loaded: with protection enabled,
  // the diary would flash in the first frame otherwise.
  // The lock screen shows no private content, so it stays in place when the
  // app goes to the background: swapping it for the curtain would unmount it
  // and re-request Face ID on every return.
  const content = locked && ready ? <LockScreen />
    : !ready || obscured ? <PrivacyCurtain /> : null;
  if (!content || Platform.OS !== 'android') return content;
  // A separate native window removes the Stack from TalkBack's tree: a plain
  // View wrapper does not hide the hosted native-stack screens on Android.
  return (
    <Modal visible statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      {content}
    </Modal>
  );
}

const stylesFactory = () => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#080604',
  },
  curtainCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: sc(14) },
  curtainName: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(20),
    letterSpacing: sc(1.5),
    color: colors.cream,
  },
  lockScreen: {
    flex: 1,
    ...column(),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc(12),
    paddingVertical: sc(28),
  },
  forgot: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(11.5),
    color: colors.goldSoft,
    textDecorationLine: 'underline',
  },
});
