import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Check, Delete, ScanFace } from 'lucide-react-native';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../lib/lock';

// Клавиатура пин-кода: точки-индикаторы + круглые цифры в стиле приложения.
//
// Два режима ввода. На разблокировке длина пина известна из хранилища, поэтому
// проверка запускается сама на последней цифре — лишнее подтверждение там
// только замедляло бы вход. При установке и смене длину выбирает пользователь
// (4–8 цифр), и закончить ввод может только он сам кнопкой «готово»: иначе
// шестизначный пин проверялся бы на четвёртой цифре.

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export type PinPadProps = {
  title: string;
  subtitle?: string | null;
  /**
   * Известная длина пина. Задана — ввод проверяется автоматически; не задана —
   * пользователь вводит от PIN_MIN_LENGTH до PIN_MAX_LENGTH цифр и подтверждает.
   */
  expectedLength?: number;
  /**
   * `null` — ввод принят. Строка — текст ошибки под точками: тряска, хаптик и
   * очистка поля. Сообщение возвращает вызывающий, потому что на одном и том же
   * поле «неверный код» и «коды не совпали» — разные ошибки.
   */
  onSubmit: (pin: string) => string | null | Promise<string | null>;
  /** Кнопка биометрии в свободном углу клавиатуры. */
  biometry?: { label: string; onPress: () => void } | null;
  /** Ссылки под клавиатурой: «Забыли пин-код?», «Отмена». */
  footer?: React.ReactNode;
  testID?: string;
};

/**
 * Точки ввода. При известной длине их ровно столько, сколько цифр в пине. При
 * свободном вводе показаны все восемь (минимум и необязательный остаток) —
 * визуально круги одинаковы по размеру и цвету, различается только заполненность.
 */
function PinDots({ entered, expectedLength }: { entered: number; expectedLength?: number }) {
  const styles = useStyles(stylesFactory);
  const total = expectedLength ?? PIN_MAX_LENGTH;
  return (
    <View style={styles.dots} accessibilityRole="progressbar">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < entered;
        return <View key={i} style={[styles.dot, filled && styles.dotFilled]} />;
      })}
    </View>
  );
}

function KeyButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  dim,
  emphasis,
  children,
  testID,
}: {
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  dim?: boolean;
  /** Янтарная заливка со свечением — для главного действия (галочка «Готово»). */
  emphasis?: boolean;
  children?: React.ReactNode;
  testID?: string;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        dim && styles.keyDim,
        emphasis && !disabled && styles.keyEmphasis,
        disabled && styles.keyDisabled,
        pressed && !disabled && styles.keyPressed,
      ]}
    >
      {children ?? <Text style={styles.keyLabel}>{label}</Text>}
    </Pressable>
  );
}

export default function PinPad({
  title,
  subtitle,
  expectedLength,
  onSubmit,
  biometry,
  footer,
  testID,
}: PinPadProps) {
  const styles = useStyles(stylesFactory);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Проверка асинхронна (хэширование + Keychain). Ref, а не состояние: он
  // должен закрыть повторный вход в submit синхронно, до следующего рендера.
  const checking = useRef(false);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const maxLength = expectedLength ?? PIN_MAX_LENGTH;
  const canConfirm = expectedLength === undefined && pin.length >= PIN_MIN_LENGTH;

  const fail = (message: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shake.value = withSequence(
      withTiming(-sc(9), { duration: 45 }),
      withTiming(sc(9), { duration: 45 }),
      withTiming(-sc(6), { duration: 45 }),
      withTiming(sc(6), { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
    setPin('');
    setError(message);
  };

  const submit = async (candidate: string) => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    try {
      const message = await onSubmit(candidate);
      // Поле очищается в любом случае: при успехе экран уходит либо сценарий
      // переходит к следующему шагу, и набранные цифры не должны там остаться.
      if (message === null) {
        setPin('');
        setError(null);
      } else {
        fail(message);
      }
    } catch {
      fail('Не удалось проверить пин-код');
    } finally {
      checking.current = false;
      setBusy(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (busy || pin.length >= maxLength) return;
    void Haptics.selectionAsync();
    const next = pin + digit;
    setError(null);
    setPin(next);
    // Автопроверка только когда длина известна заранее.
    if (expectedLength !== undefined && next.length === expectedLength) void submit(next);
  };

  const pressBackspace = () => {
    if (busy || !pin.length) return;
    void Haptics.selectionAsync();
    setError(null);
    setPin(pin.slice(0, -1));
  };

  const pressConfirm = () => {
    if (busy || !canConfirm) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void submit(pin);
  };

  const hint = error ?? subtitle ?? null;

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Animated.View style={shakeStyle}>
          <PinDots entered={pin.length} expectedLength={expectedLength} />
        </Animated.View>
        <Text
          style={[styles.hint, error ? styles.hintError : null]}
          testID="pin-hint"
          numberOfLines={2}
        >
          {hint ?? ' '}
        </Text>
      </View>

      <View style={styles.keys}>
        {DIGITS.map((digit) => (
          <KeyButton
            key={digit}
            label={digit}
            onPress={() => pressDigit(digit)}
            disabled={busy}
            testID={`pin-key-${digit}`}
          />
        ))}

        {/* Левый нижний угол: биометрия там, где её ждут, иначе — стирание,
            чтобы при свободном вводе «готово» осталось справа под большим пальцем. */}
        {expectedLength !== undefined ? (
          biometry ? (
            <KeyButton
              accessibilityLabel={biometry.label}
              onPress={biometry.onPress}
              disabled={busy}
              dim
              testID="pin-key-biometry"
            >
              <ScanFace size={22} color={colors.goldSoft} />
            </KeyButton>
          ) : (
            <View style={styles.keySpacer} />
          )
        ) : (
          <KeyButton
            accessibilityLabel="Стереть цифру"
            onPress={pressBackspace}
            disabled={busy || !pin.length}
            dim
            testID="pin-key-backspace"
          >
            <Delete size={24} color={colors.goldSoft} />
          </KeyButton>
        )}

        <KeyButton label="0" onPress={() => pressDigit('0')} disabled={busy} testID="pin-key-0" />

        {expectedLength !== undefined ? (
          <KeyButton
            accessibilityLabel="Стереть цифру"
            onPress={pressBackspace}
            disabled={busy || !pin.length}
            dim
            testID="pin-key-backspace"
          >
            <Delete size={24} color={colors.goldSoft} />
          </KeyButton>
        ) : (
          <KeyButton
            accessibilityLabel="Готово"
            onPress={pressConfirm}
            disabled={busy || !canConfirm}
            emphasis={canConfirm}
            testID="pin-key-confirm"
          >
            <Check size={24} color={canConfirm ? colors.ink : colors.labelGoldDim} />
          </KeyButton>
        )}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const KEY_SIZE = () => sc(64);

const stylesFactory = () => StyleSheet.create({
  root: { alignItems: 'center' },
  head: { alignItems: 'center' },
  title: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(19),
    lineHeight: sc(26),
    color: colors.cream,
    textAlign: 'center',
    paddingHorizontal: sc(16),
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(11),
    marginTop: sc(20),
    minHeight: sc(14),
  },
  // Все круги одного размера и цвета независимо от режима (свободный ввод,
  // разблокировка) и от того, обязательна ли эта цифра при свободном вводе —
  // заполненность видна только по заливке против контура.
  dot: {
    width: sc(10),
    height: sc(10),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.5)',
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.goldSoft, borderColor: colors.goldSoft },
  hint: {
    marginTop: sc(14),
    minHeight: sc(30),
    fontFamily: fonts.sans,
    fontSize: sc(10.5),
    lineHeight: sc(15),
    color: colors.warmHint,
    textAlign: 'center',
    paddingHorizontal: sc(24),
  },
  hintError: { color: 'rgba(240,170,120,.95)' },
  keys: {
    marginTop: sc(18),
    width: KEY_SIZE() * 3 + sc(18) * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: sc(18),
    justifyContent: 'center',
  },
  key: {
    width: KEY_SIZE(),
    height: KEY_SIZE(),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.btnGoldBg,
    borderWidth: 1,
    borderColor: colors.btnGoldBorder,
  },
  // Пустой угол клавиатуры: держит сетку, но не выглядит нажимаемой кнопкой.
  keySpacer: { width: KEY_SIZE(), height: KEY_SIZE() },
  keyDim: { backgroundColor: colors.btnGoldBgDim, borderColor: colors.btnGoldBorderDim },
  // Как GoldButton: главная CTA-кнопка экрана должна бросаться в глаза.
  keyEmphasis: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
    shadowColor: 'rgba(220,150,50,1)',
    shadowOpacity: 0.5,
    shadowRadius: sc(12),
  },
  keyDisabled: { opacity: 0.4 },
  keyPressed: { transform: [{ scale: 0.94 }], backgroundColor: 'rgba(214,182,120,.26)' },
  keyLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(25),
    color: colors.parchment,
  },
  footer: { marginTop: sc(22), alignItems: 'center', gap: sc(10) },
});
