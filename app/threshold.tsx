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
import { ChevronLeft, Lamp, QuestionMark, Clock, Shield } from '../components/icons';
import { plMinutes, useSession } from '../lib/store';
import { colors, fonts, durations, sc } from '../lib/theme';

// «15 минут» / «час» / «1:30» — как timeAmount в прототипе
const timeAmount = (minutes: number) => {
  if (minutes < 60) return `${minutes} ${plMinutes(minutes)}`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return hrs === 1 ? 'час' : `${hrs} часа`;
  return `${hrs}:${mins < 10 ? '0' : ''}${mins} ч`;
};

export default function Threshold() {
  const insets = useSafeAreaInsets();
  const s = useSession();

  // брифинг собирается из выбора на «Настройке»: цель не переписывается,
  // а выводится как есть отдельной строкой-капителью после двоеточия
  const topicTrim = s.topic.trim();
  const timeText = topicTrim
    ? s.minutes === 0
      ? 'У тебя столько времени, сколько нужно, чтобы достичь цели:'
      : `У тебя ${timeAmount(s.minutes)}, чтобы достичь цели:`
    : s.minutes === 0
      ? 'Столько времени, сколько нужно — без таймера и спешки'
      : `У тебя ${timeAmount(s.minutes)} наедине с Богом`;
  const brief = [
    {
      icon: <Clock size={16} color={colors.amberBright} />,
      text: timeText,
      goal: topicTrim || undefined,
    },
    {
      // размер здесь в px прототипа — sc() применяется внутри иконок
      icon: <QuestionMark size={16} color={colors.amberBright} />,
      text: 'Спутник будет задавать наводящие вопросы — отвечай на те, что отзываются',
    },
    {
      icon: <Shield size={16} color={colors.amberBright} />,
      text: 'Ответы и выводы сохранятся только на этом устройстве',
    },
  ];
  const progress = useSharedValue(0);
  const [hint, setHint] = useState('нажми и держи');
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
    setHint('держи…');
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
    setHint('нажми и держи');
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
        style={[styles.body, { paddingTop: insets.top + sc(12), paddingBottom: insets.bottom + sc(20) }]}
      >
        <View>
          {/* шапка как на setup: кнопка и кикер в одной строке, на той же высоте */}
          <View style={styles.headerRow}>
            <IconButton size={sc(30)} onPress={() => router.back()}>
              <ChevronLeft size={18} color={colors.white55} />
            </IconButton>
            <Kicker style={{ fontSize: sc(11) }}>Прежде чем войти</Kicker>
          </View>
          <Text style={styles.title}>Отложи остальное — вот что впереди</Text>
        </View>

        <View style={styles.brief}>
          {brief.map((b, i) => {
            // ≤2 строки — иконка по центру, длиннее — по верху (как в прототипе)
            const long = Math.ceil(b.text.length / 30) >= 3;
            return (
              <View
                key={i}
                style={[styles.briefRow, { alignItems: long ? 'flex-start' : 'center' }]}
              >
                <View style={[styles.briefIcon, long && { marginTop: 4 }]}>{b.icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.briefText}>{b.text}</Text>
                  {'goal' in b && !!b.goal && (
                    <Text style={styles.briefGoal}>{b.goal}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.holdWrap}>
          <GestureDetector gesture={hold}>
            <View style={styles.holdBtn}>
              <View style={styles.holdInner} />
              <View style={StyleSheet.absoluteFill}>
                <ProgressRing
                  size={sc(158)}
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
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: {
    flex: 1,
    paddingHorizontal: sc(16),
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginLeft: -4,
  },
  title: {
    marginTop: sc(16),
    fontFamily: fonts.serif,
    fontSize: sc(22),
    lineHeight: sc(28),
    color: colors.cream,
  },
  brief: {
    flex: 1,
    justifyContent: 'center',
    gap: sc(12),
    paddingHorizontal: 2,
  },
  briefRow: {
    flexDirection: 'row',
    gap: sc(12),
  },
  briefIcon: {
    width: sc(30),
    height: sc(30),
    borderRadius: sc(8),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230,162,60,.12)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.28)',
  },
  briefText: {
    fontFamily: fonts.sans,
    fontSize: sc(13),
    lineHeight: sc(20),
    color: colors.body,
  },
  // цель — как ввёл человек; «капитель» эмулируется мелким капсом
  // с разрядкой, в тоне кикеров приложения
  briefGoal: {
    marginTop: sc(3),
    fontFamily: fonts.monoMedium,
    fontSize: sc(11),
    lineHeight: sc(17),
    letterSpacing: sc(0.8),
    textTransform: 'uppercase',
    color: colors.goldSoft,
  },
  holdWrap: {
    alignItems: 'center',
    gap: sc(16),
  },
  holdBtn: {
    width: sc(158),
    height: sc(158),
  },
  holdInner: {
    position: 'absolute',
    top: sc(11),
    left: sc(11),
    right: sc(11),
    bottom: sc(11),
    borderRadius: sc(79),
    backgroundColor: 'rgba(230,162,60,.07)',
  },
  holdContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: sc(46),
    paddingBottom: sc(42),
  },
  holdHint: {
    fontFamily: fonts.sans,
    fontSize: sc(10),
    letterSpacing: sc(1.8),
    textTransform: 'uppercase',
    color: colors.warmHint,
  },
  holdLabel: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(17),
    color: colors.creamBright,
  },
});
