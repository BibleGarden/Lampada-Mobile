import { useI18n, pluralCategory } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, LayoutChangeEvent, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, withTiming, Easing, ReduceMotion, cancelAnimation } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import ScreenHeader from '../components/ScreenHeader';
import ProgressRing from '../components/ProgressRing';
import { Lamp, QuestionMark, Clock, Shield } from '../components/icons';
import { useSession } from '../lib/store';
import { useSettings } from '../lib/settings';
import { errorKind, recordDiagnostic } from '../lib/db';
import { useVisibleScreen } from '../lib/useVisibleScreen';
import { THRESHOLD_DENSITIES, ThresholdDensity, fitThresholdDensity } from '../lib/thresholdLayout';
import { colors, column, durations, fonts, isTablet, sc, screenGutter, useStyles } from '../lib/theme';

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
  const { width, height } = useWindowDimensions();
  const tablet = isTablet();
  const landscapeTablet = tablet && width > height;
  // Heights of the block under the header and of the brief: on short windows
  // the gaps and the button get denser so every item fits above the button.
  const [mainHeight, setMainHeight] = useState<number>();
  const [briefSize, setBriefSize] = useState<{ height: number; density: ThresholdDensity }>();
  const insets = useSafeAreaInsets();
  const s = useSession();
  const answerContextConsent = useSettings((state) => state.answerContextConsent);

  // The brief keeps the topic exactly as the person worded it and merely
  // continues the neutral "Prayer topic" caption with it visually.
  const topicTrim = s.topic.trim();
  const goal = topicTrim;
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
      // the size here is in prototype px — sc() is applied inside the icons
      icon: <QuestionMark size={16} color={colors.amberBright} />,
      text: t('screens.threshold.questions'),
    },
    {
      icon: <Shield size={16} color={colors.amberBright} />,
      text: t(`screens.threshold.answers.${answerContextConsent}`),
    },
  ];
  const { density, overflow } = landscapeTablet || mainHeight === undefined || briefSize === undefined
    ? { density: THRESHOLD_DENSITIES[0], overflow: false }
    : fitThresholdDensity(
      { mainHeight, briefHeight: briefSize.height, gaps: brief.length, density: briefSize.density },
      sc,
    );
  const holdButtonSize = sc(density.button);
  // the inner disc insets from the ring by the same fraction as in the design (11 of 158)
  const holdInset = sc(Math.round((density.button * 11) / 158));
  const onMainLayout = (e: LayoutChangeEvent) => setMainHeight(e.nativeEvent.layout.height);
  const onBriefLayout = (e: LayoutChangeEvent) =>
    setBriefSize({ height: e.nativeEvent.layout.height, density });
  // The brief did not fit even in the densest form: on iOS the scroll bar
  // flashes, on Android the list edges fade instead of cutting the line.
  const briefScroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (overflow) briefScroll.current?.flashScrollIndicators();
  }, [overflow]);

  const progress = useSharedValue(0);
  const visible = useVisibleScreen();
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
  useEffect(() => {
    // While entering, the screen navigates away on its own: the loading
    // caption and the full ring remain.
    if (visible || entering.current) return;
    clearTimers();
    cancelAnimation(progress);
    progress.value = 0;
    setHint('screens.threshold.hold');
  }, [visible, progress]);

  const enter = async () => {
    if (entering.current) return;
    entering.current = true;
    setHint('screens.questionLoading');
    try {
      await s.enterSession();
    } catch (error) {
      recordDiagnostic('session_start_failed', { errorKind: errorKind(error) });
      Alert.alert(t('screens.threshold.error'), t('screens.retryMessage'), [{ text: t('screens.understood') }]);
      // on an enterSession error the button must not be left dead
      entering.current = false;
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/session');
  };

  const begin = () => {
    if (entering.current) return;
    setHint('screens.threshold.holding');
    progress.value = withTiming(1, {
      duration: durations.holdToStart,
      easing: Easing.out(Easing.quad),
      // filling the ring is functional feedback for the hold, not decoration:
      // with "Reduce motion" it must not jump to the end
      reduceMotion: ReduceMotion.Never,
    });
    // escalating haptics: the ticks speed up towards completion
    [0, 300, 550, 750, 920, 1060, 1180, 1280].forEach((t, i) => {
      hapticTimers.current.push(
        setTimeout(() => {
          Haptics.impactAsync(
            i < 4 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
          );
        }, t),
      );
    });
    holdTimer.current = setTimeout(() => void enter(), durations.holdToStart);
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
        style={[
          styles.body,
          landscapeTablet && styles.bodyLandscape,
          { paddingTop: insets.top + sc(10), paddingBottom: insets.bottom },
        ]}
      >
        <View style={landscapeTablet && styles.headerRowLandscape}>
          <ScreenHeader title={t('screens.threshold.before')} titleTestID="threshold-kicker" backLabel={t('settings.back')} onBack={() => router.back()} />
        </View>

        <View
          style={[
            styles.main,
            landscapeTablet && styles.mainLandscape,
            { paddingBottom: sc(density.bottom) },
          ]}
          onLayout={onMainLayout}
        >
           {/* the heading hugs the list: spare air goes above it, not below */}
          <ScrollView
            ref={briefScroll}
            style={styles.briefScroll}
            contentContainerStyle={[styles.brief, { paddingVertical: sc(density.padding) }]}
            fadingEdgeLength={overflow ? sc(24) : 0}
          >
            <View style={{ gap: sc(density.gap) }} onLayout={onBriefLayout}>
              <Text style={styles.title}>{t('screens.threshold.title')}</Text>
              {brief.map((b, i) => {
                // ≤2 lines — icon centered, longer — icon at the top (as in
                // the prototype); the goal is part of the same line, its
                // length counts too
                const long = Math.ceil((b.text.length + (b.goal?.length ?? 0)) / 30) >= 3;
                return (
                  <View
                    key={i}
                    testID={`threshold-brief-${i}`}
                    style={[styles.briefRow, { alignItems: long ? 'flex-start' : 'center' }]}
                  >
                    <View style={[styles.briefIcon, long && { marginTop: 4 }]}>{b.icon}</View>
                    {/* Nested Text measures width poorly (it overflows the
                        edge) — a View wrapper constrains the width */}
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
          </ScrollView>

          <View style={[styles.holdWrap, landscapeTablet && styles.holdWrapLandscape]}>
            <GestureDetector gesture={hold}>
              <View
                style={{ width: holdButtonSize, height: holdButtonSize }}
                // without accessible, VoiceOver focuses the labels inside, and
                // a double tap on them is a short tap that cancels the hold
                accessible
                accessibilityRole="button"
                accessibilityLabel={t('screens.threshold.start')}
                // A screen reader cannot hold a double tap: for it the button
                // fires immediately, without the hold ritual. On iOS (Fabric)
                // the double tap arrives only in onAccessibilityTap, and an
                // "activate" action there would become a redundant item in
                // the Actions rotor; TalkBack, on the contrary, only knows
                // the action.
                onAccessibilityTap={() => void enter()}
                accessibilityActions={Platform.OS === 'android' ? [{ name: 'activate' }] : undefined}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === 'activate') void enter();
                }}
                testID="threshold-hold-button"
              >
                <View
                  style={[
                    styles.holdInner,
                    { top: holdInset, left: holdInset, right: holdInset, bottom: holdInset, borderRadius: holdButtonSize / 2 },
                  ]}
                />
                <View style={StyleSheet.absoluteFill}>
                  <ProgressRing
                    size={holdButtonSize}
                    strokeWidth={2.5}
                    progress={progress}
                    trackColor="rgba(230,162,60,.14)"
                    gradient={['#ffdca0', '#d68a2e']}
                  />
                </View>
                <View style={styles.holdContent} pointerEvents="none">
                  <Lamp />
                  <Text style={styles.holdLabel}>{t('screens.threshold.start')}</Text>
                  <Text style={styles.holdHint}>{t(hint)}</Text>
                </View>
              </View>
            </GestureDetector>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: {
    flex: 1,
    paddingHorizontal: screenGutter(),
    ...column(),
    justifyContent: 'space-between',
  },
  bodyLandscape: {
    maxWidth: 1120,
    paddingHorizontal: sc(24),
  },
  main: {
    flex: 1,
  },
  mainLandscape: {
    flexDirection: 'row',
    gap: sc(32),
  },
  headerRowLandscape: {
    ...column(),
    paddingHorizontal: screenGutter(),
  },
  title: {
    marginBottom: sc(6),
    fontFamily: fonts.serif,
    fontSize: sc(22),
    lineHeight: sc(28),
    color: colors.cream,
  },
  briefScroll: {
    flex: 1,
  },
  // paddings and gaps are set by the screen density (lib/thresholdLayout.ts)
  brief: {
    flexGrow: 1,
    justifyContent: 'center',
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
  // the goal sits inside the phrase, same font size, set apart only by gold
  briefGoal: {
    fontFamily: fonts.sansMedium,
    color: colors.goldSoft,
  },
  holdWrap: {
    flexShrink: 0,
    alignItems: 'center',
    gap: sc(16),
  },
  holdWrapLandscape: {
    width: sc(190),
    justifyContent: 'center',
  },
  holdInner: {
    position: 'absolute',
    backgroundColor: 'rgba(230,162,60,.07)',
  },
  holdContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(4),
  },
  holdHint: {
    // Two lines stay inside the circle; the height does not change while holding.
    width: sc(112),
    height: sc(32),
    textAlign: 'center',
    fontFamily: fonts.sans,
    fontSize: sc(9),
    lineHeight: sc(13),
    letterSpacing: sc(1),
    textTransform: 'uppercase',
    color: colors.warmHint,
  },
  holdLabel: {
    textAlign: 'center',
    fontFamily: fonts.serifRegular,
    fontSize: sc(17),
    lineHeight: sc(24),
    color: colors.creamBright,
  },
});
