import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
  type AccessibilityState,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

/** Подпись капсом моноширинным — фирменный элемент прототипа */
export function Kicker({
  children,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Text style={[styles.kicker, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/** Главная золотая кнопка */
export function GoldButton({
  label,
  onPress,
  style,
  testID,
  compact,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Низкий вариант: высота как у кнопок карточки-спутника */
  compact?: boolean;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={testID}
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
        <Text style={[styles.goldBtnLabel, compact && styles.goldBtnLabelCompact]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Круглая иконка-кнопка (назад, крестик, музыка) */
export function IconButton({
  children,
  onPress,
  size = sc(34),
  bg = colors.white05,
  border,
  style,
  accessibilityLabel,
  accessibilityState,
  testID,
}: {
  children: React.ReactNode;
  onPress: () => void;
  size?: number;
  bg?: string;
  border?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      accessibilityState={accessibilityState}
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

/** Появление карточки снизу — аналог qIn из прототипа */
export function CardIn({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <Animated.View entering={FadeInDown.duration(350)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Точки-индикатор с «окном» из 7, как _winDots в прототипе */
export function WindowDots({
  total,
  current,
  onSet,
}: {
  total: number;
  current: number;
  onSet: (i: number) => void;
}) {
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
    <View style={styles.dotsRow}>
      {dots.map(({ i, kind }) => (
        <Pressable key={i} hitSlop={6} onPress={() => onSet(i)}>
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
  // низкий вариант — и шрифт как у кнопок карточки-спутника
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
