import React, { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  UIManager,
  View,
  ViewStyle,
  StyleProp,
  type AccessibilityState,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleHelp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

// Старая архитектура Android не анимирует layout-переходы без явного флага;
// на iOS и на Fabric вызов безвреден. Метод не описан в типах RN, хотя
// существует в рантайме — отсюда каст.
const legacyUIManager = UIManager as unknown as { setLayoutAnimationEnabled?: (v: boolean) => void };
if (Platform.OS === 'android' && legacyUIManager.setLayoutAnimationEnabled) {
  legacyUIManager.setLayoutAnimationEnabled(true);
}

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
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
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
        style={styles.goldBtn}
      >
        <Text style={styles.goldBtnLabel}>{label}</Text>
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

/**
 * Короткая ключевая фраза видна всегда, полный текст подсказки — по тапу на
 * «?». Убирает длинные серые подсказки с экрана, не пряча смысл: развернуть
 * можно в любой момент. `style` задаёт типографику (обычно settingHint) и
 * применяется и к видимой фразе, и к развёрнутому тексту.
 */
export function HintReveal({
  summary,
  details,
  testID,
  style,
}: {
  summary: string;
  details: string;
  testID: string;
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles(stylesFactory);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void Haptics.selectionAsync();
    setOpen((v) => !v);
  };
  return (
    <View>
      <View style={styles.hintRow}>
        <Text style={[style, styles.hintSummary]}>{summary}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Скрыть подробности' : 'Подробнее'}
          accessibilityState={{ expanded: open }}
          testID={testID}
          hitSlop={10}
          onPress={toggle}
          style={styles.hintToggle}
        >
          <CircleHelp size={sc(15)} color={colors.labelGold} />
        </Pressable>
      </View>
      {open ? <Text style={style}>{details}</Text> : null}
    </View>
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
  goldBtnLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: sc(14),
    color: colors.ink,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: sc(7),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sc(8),
  },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sc(6) },
  hintSummary: { flex: 1 },
  hintToggle: { padding: sc(3), marginTop: sc(1) },
});
