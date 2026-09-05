import { useI18n } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import ScreenBg from './ScreenBg';
import PinPad from './PinPad';
import { Lamp } from './icons';
import { colors, column, fonts, sc, useStyles } from '../lib/theme';
import { useSettings } from '../lib/settings';
import {
  authenticateWithBiometrics,
  biometryInfo,
  useLock,
  verifyPin,
  wipeEverything,
  type BiometryInfo,
} from '../lib/lock';

// Гейт блокировки. Живёт в корневом layout поверх Stack, а не отдельным
// маршрутом: экран, до которого можно дойти навигацией, можно и обойти —
// диплинком, возвратом назад или уведомлением. Оверлей поверх всей навигации
// обойти нечем.

const APP_NAME = 'Lampada';

/**
 * Шторка приватности. Показывается, когда приложение неактивно, чтобы снимок в
 * переключателе приложений не сохранил открытый дневник, и пока конфигурация
 * защиты ещё не прочитана — до этого момента неизвестно, можно ли показывать
 * контент вообще.
 *
 * `accessibilityViewIsModal` — не косметика: перекрытие пикселей прячет контент
 * только от глаз и от касаний. VoiceOver ходит по дереву доступности, а не по
 * экрану, и без этого флага читал бы вслух дневник под шторкой.
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
  // Ошибка биометрии (не отмена) на экране блокировки. Alert'ом не показываем:
  // автозапрос при каждом появлении экрана заспамил бы им пользователя —
  // вместо этого подсказка под пин-падом объясняет, почему Face ID не сработал.
  const [biometryError, setBiometryError] = useState<string | null>(null);
  // Автозапрос выполняется один раз за появление экрана. Системный лист Face ID
  // сам переводит приложение в inactive, и без этого флага возврат из него
  // запускал бы запрос заново — бесконечным кольцом.
  const autoPrompted = useRef(false);

  const runBiometrics = async () => {
    setBiometryError(null);
    const result = await authenticateWithBiometrics(t('components.security.unlockApp', { name: APP_NAME }));
    if (result.ok) {
      unlock();
      return;
    }
    // Отмена (в том числе автозапросом на фоне) — не повод что-то говорить:
    // человек и так видит пин-пад и может им воспользоваться.
    if (result.reason === 'error') setBiometryError(result.message);
  };

  useEffect(() => {
    if (!biometricsOn) return;
    let alive = true;
    void biometryInfo().then((info) => {
      if (!alive) return;
      setBiometry(info);
      // Образцы могли удалить в системе уже после включения тумблера: тогда
      // остаётся только пин, и предлагать биометрию бессмысленно.
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
      await wipeEverything();
      // Настройки перечитываются как на новой установке: база пересоздаётся
      // миграцией при первом же обращении.
      void useSettings.getState().load().catch(() => undefined);
      router.replace('/');
    } catch {
      // Стирание не удалось — защита остаётся включённой, и пользователь должен
      // это увидеть, а не остаться перед экраном, который «ничего не сделал».
      Alert.alert(
        t('components.security.wipeError'),
        t('components.security.wipeErrorHint'),
      );
    } finally {
      setWiping(false);
    }
  };

  // Два подтверждения подряд: стирание безвозвратно, и случайное нажатие на
  // ссылку под клавиатурой не должно стоить человеку всего дневника.
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

  // Модальность для VoiceOver обязательна ровно по той же причине, что и у
  // шторки: заблокированное приложение не должно ни читаться, ни активироваться
  // жестами в обход оверлея.
  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="lock-screen">
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(320)} style={styles.lockScreen}>
        <PinPad
          title={t('components.security.enterPin')}
          subtitle={
            canUseBiometry
              ? biometryError ?? t('components.security.orBiometrics', { name: biometry?.label ?? '' })
              : t('components.security.pinProtected')
          }
          expectedLength={pinLength}
          onSubmit={submitPin}
          biometry={
            canUseBiometry && biometry
              ? { label: t('components.security.useBiometrics', { name: biometry.label }), onPress: () => void runBiometrics() }
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
 * Единственная точка, где приложение решает, показывать ли контент. Подписка на
 * AppState живёт здесь же: точечные подписки других экранов (настройки, сессия)
 * работают независимо и этой не мешают.
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

  // До чтения конфигурации контент не показывается: иначе при включённой защите
  // дневник успел бы мелькнуть на первом кадре.
  if (!ready) return <PrivacyCurtain />;
  // Экран блокировки приватного содержимого не показывает, поэтому при уходе в
  // фон он остаётся на месте: подменять его шторкой значило бы размонтировать
  // его и заново запрашивать Face ID на каждом возврате.
  if (locked) return <LockScreen />;
  if (obscured) return <PrivacyCurtain />;
  return null;
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
