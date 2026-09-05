import { useI18n, pluralCategory } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import ProgressRing from '../components/ProgressRing';
import { IconButton, Kicker } from '../components/ui';
import { ChevronLeft, Lamp, QuestionMark, Clock, Shield } from '../components/icons';
import { useSession } from '../lib/store';
import { recordDiagnostic } from '../lib/db';
import { colors, column, durations, fonts, sc, useStyles } from '../lib/theme';

export default function Threshold() {
  const { t, language } = useI18n();
  const timeAmount = (minutes: number) => {
    const plural = (unit: string, count: number) => t(`screens.${unit}.${pluralCategory(language, count)}`);
    if (minutes < 60) return `${minutes} ${plural('minute', minutes)}`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours} ${plural('hour', hours)}`
      : t('screens.duration.hoursMinutes', { hours, minutes: remainder });
  };
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const s = useSession();

  // брифинг собирается из выбора на «Настройке»: цель не переписывается,
  // а вливается в фразу как есть, с золотой подсветкой (строчная — она
  // продолжает предложение после двоеточия)
  const topicTrim = s.topic.trim();
  const goal = topicTrim.replace(/^[А-ЯA-ZЁ]/, (c) => c.toLowerCase());
  const timeText = topicTrim
    ? s.minutes === 0
      ? t('screens.threshold.unlimitedGoal')
      : t('screens.threshold.timedGoal', { duration: timeAmount(s.minutes) })
    : s.minutes === 0
      ? t('screens.threshold.unlimited')
      : t('screens.threshold.timed', { duration: timeAmount(s.minutes) });
  const brief = [
    {
      icon: <Clock size={16} color={colors.amberBright} />,
      text: timeText,
      goal: goal || undefined,
    },
    {
      // размер здесь в px прототипа — sc() применяется внутри иконок
      icon: <QuestionMark size={16} color={colors.amberBright} />,
      text: t('screens.threshold.questions'),
    },
    {
      icon: <Shield size={16} color={colors.amberBright} />,
      text: t('screens.threshold.local'),
    },
  ];
  const progress = useSharedValue(0);
  const [hint, setHint] = useState('screens.threshold.hold');
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
    setHint('screens.threshold.holding');
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
      setHint('screens.questionLoading');
      try {
        await s.enterSession();
      } catch (error) {
        recordDiagnostic('session_start_failed', error);
        Alert.alert(t('screens.threshold.error'), t('screens.retryMessage'), [{ text: t('screens.understood') }]);
        // при ошибке enterSession кнопка не должна остаться мёртвой
        entering.current = false;
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/session');
    }, durations.holdToStart);
  };

  const cancel = () => {
    if (entering.current) return;
    clearTimers();
    setHint('screens.threshold.hold');
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
        style={[styles.body, { paddingTop: insets.top + sc(12), paddingBottom: insets.bottom + sc(34) }]}
      >
        {/* шапка как на setup: кнопка и кикер в одной строке, на той же высоте */}
        <View style={styles.headerRow}>
          <IconButton size={sc(30)} onPress={() => router.back()}>
            <ChevronLeft size={18} color={colors.white55} />
          </IconButton>
          <Kicker style={{ fontSize: sc(11) }}>{t('screens.threshold.before')}</Kicker>
        </View>

        {/* заголовок прижат к списку: свободный воздух — над ним, не под ним */}
        <View style={styles.brief}>
          <Text style={styles.title}>{t('screens.threshold.title')}</Text>
          {brief.map((b, i) => {
            // ≤2 строки — иконка по центру, длиннее — по верху (как в прототипе);
            // цель — часть той же строки, её длина тоже считается
            const long = Math.ceil((b.text.length + (b.goal?.length ?? 0)) / 30) >= 3;
            return (
              <View
                key={i}
                style={[styles.briefRow, { alignItems: long ? 'flex-start' : 'center' }]}
              >
                <View style={[styles.briefIcon, long && { marginTop: 4 }]}>{b.icon}</View>
                {/* Text с вложенным Text меряет ширину криво (уезжает за
                    край) — ширину ограничивает View-обёртка */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.briefText}>
                    {b.text}
                    {'goal' in b && !!b.goal && (
                      <Text style={styles.briefGoal}>{b.goal}</Text>
                    )}
                  </Text>
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
                <Text style={styles.holdHint}>{t(hint)}</Text>
                <Text style={styles.holdLabel}>{t('screens.threshold.start')}</Text>
              </View>
            </View>
          </GestureDetector>
        </View>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: {
    flex: 1,
    paddingHorizontal: sc(16),
    ...column(),
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginLeft: -4,
  },
  title: {
    marginBottom: sc(6),
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
  // цель — внутри фразы, тем же кеглем, выделена только золотом
  briefGoal: {
    fontFamily: fonts.sansMedium,
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
