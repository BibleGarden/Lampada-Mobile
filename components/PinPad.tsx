import { useI18n } from '../lib/i18n';
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
import { colors, fonts, sc, useStyles } from '../lib/theme';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../lib/lock';

// PIN keypad: indicator dots + round digits in the app's style.
//
// Two input modes. On unlock the PIN length is known from storage, so the
// check starts by itself on the last digit — an extra confirmation there would
// only slow entry down. When setting or changing it, the user picks the length
// (4–8 digits) and only they can finish input with the "Done" button: otherwise
// a six-digit PIN would be checked on the fourth digit.

// Only the key geometry is clamped; text keeps the app's scale.
const keyScale = (value: number) => Math.min(sc(value), value * 1.25);

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export type PinPadProps = {
  title: string;
  subtitle?: string | null;
  /**
   * Known PIN length. When set, input is checked automatically; when not, the
   * user enters PIN_MIN_LENGTH to PIN_MAX_LENGTH digits and confirms.
   */
  expectedLength?: number;
  /**
   * `null` — input accepted. A string — error text under the dots: shake,
   * haptic, and the field is cleared. The caller returns the message because
   * "wrong code" and "codes do not match" are different errors on the same field.
   */
  onSubmit: (pin: string) => string | null | Promise<string | null>;
  /** Biometry button in the keypad's free corner. */
  biometry?: { label: string; onPress: () => void } | null;
  /** Links under the keypad: "Forgot your PIN?" (components.security.forgotPin), "Cancel". */
  footer?: React.ReactNode;
  testID?: string;
  /** Stable title id for e2e: the scenario steps are told apart by it. */
  titleTestID?: string;
};

/**
 * Input dots. With a known length there are exactly as many as PIN digits.
 * With free input all eight are shown (the minimum plus the optional rest) —
 * visually the circles are the same size and color, differing only in fill.
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
  plain,
  emphasis,
  children,
  testID,
}: {
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  dim?: boolean;
  plain?: boolean;
  /** Amber fill with a glow — for the main action (the "Done" checkmark). */
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
        plain && styles.keyPlain,
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
  titleTestID,
}: PinPadProps) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The check is asynchronous (hashing + Keychain). A ref, not state: it must
  // block re-entry into submit synchronously, before the next render.
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
      // The field is cleared either way: on success the screen goes away or
      // the flow moves to the next step, and the typed digits must not remain.
      if (message === null) {
        setPin('');
        setError(null);
      } else {
        fail(message);
      }
    } catch {
      fail(t('components.security.checkPinError'));
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
    // Auto-check only when the length is known in advance.
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
        <Text style={styles.title} testID={titleTestID}>{title}</Text>
        <Animated.View style={shakeStyle}>
          <PinDots entered={pin.length} expectedLength={expectedLength} />
        </Animated.View>
        <Text
          style={[styles.hint, error ? styles.hintError : null]}
          testID="pin-hint"
          numberOfLines={3}
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

        {/* Bottom-left corner: biometry where it is expected, otherwise
            backspace, so with free input "Done" stays on the right under the thumb. */}
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
            accessibilityLabel={t('components.security.eraseDigit')}
            onPress={pressBackspace}
            disabled={busy || !pin.length}
            plain
            testID="pin-key-backspace"
          >
            <Delete size={26} strokeWidth={1.5} color={colors.goldSoft} />
          </KeyButton>
        )}

        <KeyButton label="0" onPress={() => pressDigit('0')} disabled={busy} testID="pin-key-0" />

        {expectedLength !== undefined ? (
          <KeyButton
            accessibilityLabel={t('components.security.eraseDigit')}
            onPress={pressBackspace}
            disabled={busy || !pin.length}
            plain
            testID="pin-key-backspace"
          >
            <Delete size={26} strokeWidth={1.5} color={colors.goldSoft} />
          </KeyButton>
        ) : (
          <KeyButton
            accessibilityLabel={t('components.security.done')}
            onPress={pressConfirm}
            disabled={busy || !canConfirm}
            emphasis={canConfirm}
            testID="pin-key-confirm"
          >
            <Check size={24} color={canConfirm ? colors.ink : colors.labelGold} />
          </KeyButton>
        )}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const KEY_SIZE = () => keyScale(64);

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
  // All circles are the same size and color regardless of mode (free input,
  // unlock) and of whether the digit is required in free input — fill level is
  // visible only as fill against outline.
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
    // Three lines: that much is taken by the code-recovery warning during
    // setup; the reserve is fixed so the keypad does not jump.
    minHeight: sc(45),
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
    width: KEY_SIZE() * 3 + keyScale(18) * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: keyScale(18),
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
  // Empty keypad corner: holds the grid but does not look like a pressable button.
  keySpacer: { width: KEY_SIZE(), height: KEY_SIZE() },
  // Backspace outline without a circle; the touch area matches a digit key.
  keyPlain: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyDim: { backgroundColor: colors.btnGoldBgDim, borderColor: colors.btnGoldBorderDim },
  // Like GoldButton: the screen's main CTA must stand out.
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
    fontSize: keyScale(28),
    color: colors.parchment,
  },
  footer: { marginTop: sc(22), alignItems: 'center', gap: sc(10) },
});
