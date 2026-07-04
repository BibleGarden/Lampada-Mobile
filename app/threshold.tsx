import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import ProgressRing from '../components/ProgressRing';
import { IconButton, Kicker } from '../components/ui';
import { ChevronLeft, Lamp, QuestionMark, Book, Mic } from '../components/icons';
import { useSession } from '../lib/store';
import { colors, fonts, durations } from '../lib/theme';

const BRIEF = [
  {
    icon: <QuestionMark size={15} color={colors.amberBright} />,
    text: 'Спутник будет тихо предлагать вопросы — они помогут молитве не рассыпаться.',
  },
  {
    icon: <Book size={15} color={colors.amberBright} />,
    text: 'Рядом — Писание: стихи, созвучные твоей цели. Можно листать и сохранять.',
  },
  {
    icon: <Mic size={15} color={colors.amberBright} />,
    text: 'Отвечать можно словами или голосом — всё останется только у тебя.',
  },
];

export default function Threshold() {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const progress = useSharedValue(0);
  const [hint, setHint] = useState('удерживай');
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hapticTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const entering = useRef(false);

  const clearTimers = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
  };

  useEffect(() => clearTimers, []);

  const begin = () => {
    if (entering.current) return;
    setHint('не отпускай');
    progress.value = withTiming(1, {
      duration: durations.holdToStart,
      easing: Easing.out(Easing.quad),
    });
    // нарастающая хаптика: тики учащаются к завершению
    [0, 300, 550, 750, 920, 1060, 1180, 1280].forEach((t, i) => {
      hapticTimers.current.push(
        setTimeout(() => {
          Haptics.impactAsync(
            i < 4 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
          );
        }, t),
      );
    });
    holdTimer.current = setTimeout(async () => {
      entering.current = true;
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await s.enterSession();
        router.replace('/session');
      } finally {
        // при ошибке enterSession кнопка не должна остаться мёртвой
        entering.current = false;
      }
    }, durations.holdToStart);
  };

  const cancel = () => {
    if (entering.current) return;
    clearTimers();
    setHint('удерживай');
    progress.value = withTiming(0, { duration: 250 });
  };

  const hold = Gesture.LongPress()
    .minDuration(1)
    .maxDistance(80)
    .onBegin(() => begin())
    .onFinalize(() => cancel())
    .runOnJS(true);

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View
        entering={FadeIn.duration(500)}
        style={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}
      >
        <View>
          <IconButton size={30} onPress={() => router.back()} style={{ marginLeft: -4 }}>
            <ChevronLeft size={18} color={colors.white55} />
          </IconButton>
          <Kicker style={{ marginTop: 14 }}>Прежде чем войти</Kicker>
          <Text style={styles.title}>Отложи остальное — вот что впереди</Text>
        </View>

        <View style={styles.brief}>
          {BRIEF.map((b, i) => (
            <View key={i} style={styles.briefRow}>
              <View style={styles.briefIcon}>{b.icon}</View>
              <Text style={styles.briefText}>{b.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.holdWrap}>
          <GestureDetector gesture={hold}>
            <View style={styles.holdBtn}>
              <View style={styles.holdInner} />
              <View style={StyleSheet.absoluteFill}>
                <ProgressRing
                  size={158}
                  strokeWidth={2.5}
                  progress={progress}
                  trackColor="rgba(230,162,60,.14)"
                  gradient={['#ffdca0', '#d68a2e']}
                />
              </View>
              <View style={styles.holdContent} pointerEvents="none">
                <Lamp />
                <Text style={styles.holdHint}>{hint}</Text>
                <Text style={styles.holdLabel}>НАЧАТЬ</Text>
              </View>
            </View>
          </GestureDetector>
          <View style={styles.quietRow}>
            <View style={styles.quietDot} />
            <Text style={styles.quietText}>приложение будет молчать всю молитву</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  title: {
    marginTop: 7,
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: '#efe9da',
  },
  brief: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 2,
  },
  briefRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  briefIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230,162,60,.12)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.28)',
    marginTop: 1,
  },
  briefText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: colors.body,
  },
  holdWrap: {
    alignItems: 'center',
    gap: 16,
  },
  holdBtn: {
    width: 158,
    height: 158,
  },
  holdInner: {
    position: 'absolute',
    top: 11,
    left: 11,
    right: 11,
    bottom: 11,
    borderRadius: 79,
    backgroundColor: 'rgba(230,162,60,.07)',
  },
  holdContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 46,
    paddingBottom: 42,
  },
  holdHint: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: 'rgba(240,200,140,.7)',
  },
  holdLabel: {
    fontFamily: fonts.serifRegular,
    fontSize: 17,
    color: '#f3eee2',
  },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quietDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  quietText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(255,255,255,.5)',
  },
});
