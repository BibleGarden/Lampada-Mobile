import React from 'react';
import { useI18n } from '../lib/i18n';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
  type AccessibilityState,
  type AccessibilityValue,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts, radius, sc, touchSlop, useStyles } from '../lib/theme';

/** Uppercase monospace label — a signature element of the prototype */
export function Kicker({
  children,
  style,
  numberOfLines,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Text style={[styles.kicker, style]} numberOfLines={numberOfLines} testID={testID}>
      {children}
    </Text>
  );
}

/** The primary gold button */
export function GoldButton({
  label,
  onPress,
  style,
  testID,
  compact,
  disabled = false,
  accessibilityLabel = label,
  accessibilityValue,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Low variant: the same height as the companion card buttons */
  compact?: boolean;
  disabled?: boolean;
  /** The action when the visible label is its state ("Done" stops the recording) */
  accessibilityLabel?: string;
  accessibilityValue?: AccessibilityValue;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValue}
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      accessibilityState={{ disabled }}
      hitSlop={compact ? touchSlop(sc(32)) : undefined}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <LinearGradient
        colors={[colors.amber, colors.amberDeep]}
        style={[styles.goldBtn, compact && styles.goldBtnCompact]}
      >
        {/* A long label ("Save and finish") must not bloat the button to the
            edges: shrink the font instead of wrapping and clipping. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={[styles.goldBtnLabel, compact && styles.goldBtnLabelCompact]}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Round icon button (back, close, music) */
export function IconButton({
  children,
  onPress,
  size = sc(34),
  bg = colors.white05,
  border,
  style,
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  testID,
}: {
  children: React.ReactNode;
  onPress: () => void;
  size?: number;
  bg?: string;
  border?: string;
  style?: StyleProp<ViewStyle>;
  /** An icon-only button: without a label a screen reader cannot name it */
  accessibilityLabel: string;
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  testID?: string;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderWidth: border ? 1 : 0,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { transform: [{ scale: 0.9 }] },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * Content appearing from below — the prototype's qIn: opacity plus a 25 pt
 * rise over 350 ms on mount; a new appearance needs a new `key`.
 * An animated style, not the `entering` layout animation: on Android
 * Reanimated drops `entering` frames that arrive before the native view is
 * mounted and restores only opacity — the content stayed shifted down and
 * poked out of the card frame.
 */
export function CardIn({
  children,
  style,
  duration = 350,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.value = withTiming(1, { duration });
  }, [progress, duration]);
  const enter = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 25 }],
  }));
  return <Animated.View style={[style, enter]}>{children}</Animated.View>;
}

/**
 * Indicator dots with a 7-dot "window", like _winDots in the prototype.
 *
 * For VoiceOver the row is one adjustable element, like the system
 * UIPageControl: "Question, 3 of 7", swipe up/down to page. The individual
 * dots are smaller than 44 pt and duplicated by the nearby back/forward
 * buttons, so they are hidden.
 */
export function WindowDots({
  total,
  current,
  onSet,
  accessibilityLabel,
}: {
  total: number;
  current: number;
  onSet: (i: number) => void;
  accessibilityLabel: string;
}) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  type Kind = 'cur' | 'edge' | 'norm';
  const dots: { i: number; kind: Kind }[] = [];
  if (total <= 7) {
    for (let i = 0; i < total; i++) dots.push({ i, kind: i === current ? 'cur' : 'norm' });
  } else {
    const start = Math.max(0, Math.min(current - 3, total - 7));
    for (let i = start; i < start + 7; i++) {
      let kind: Kind = 'norm';
      if (i === current) kind = 'cur';
      else if ((i === start && start > 0) || (i === start + 6 && start + 6 < total - 1))
        kind = 'edge';
      dots.push({ i, kind });
    }
  }
  const size = (k: Kind) => sc(k === 'cur' ? 8 : k === 'edge' ? 4 : 6);
  const bg = (k: Kind) =>
    k === 'cur' ? colors.goldSoft : k === 'edge' ? 'rgba(214,182,120,.2)' : 'rgba(214,182,120,.32)';
  return (
    <View
      style={styles.dotsRow}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: t('components.reader.position', { current: current + 1, total }) }}
      // iOS (Fabric) delivers adjuster swipes to onAccessibilityAction by the
      // adjustable role alone, and declared actions would become extra items
      // in the Actions rotor; TalkBack pages only with declared actions.
      accessibilityActions={
        Platform.OS === 'android' ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
      }
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'increment' && current < total - 1) onSet(current + 1);
        if (nativeEvent.actionName === 'decrement' && current > 0) onSet(current - 1);
      }}
    >
      {dots.map(({ i, kind }) => (
        <Pressable
          key={i}
          accessible={false}
          hitSlop={6}
          onPress={() => onSet(i)}
        >
          <View
            style={{
              width: size(kind),
              height: size(kind),
              borderRadius: size(kind) / 2,
              backgroundColor: bg(kind),
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  kicker: {
    fontFamily: fonts.mono,
    fontSize: sc(10),
    letterSpacing: sc(1.6),
    textTransform: 'uppercase',
    color: colors.labelGold,
  },
  goldBtn: {
    paddingVertical: sc(13),
    paddingHorizontal: sc(10),
    borderRadius: radius.sm,
    alignItems: 'center',
    shadowColor: 'rgba(220,150,50,1)',
    shadowOpacity: 0.5,
    shadowRadius: sc(12),
    shadowOffset: { width: 0, height: sc(8) },
    elevation: 6,
  },
  goldBtnCompact: {
    paddingVertical: 0,
    height: sc(32),
    justifyContent: 'center',
  },
  goldBtnLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: sc(14),
    color: colors.ink,
  },
  // low variant — and the font of the companion card buttons
  goldBtnLabelCompact: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(12),
  },
  dotsRow: {
    flexDirection: 'row',
    gap: sc(7),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sc(8),
  },
});
