import { useI18n, pluralCategory } from '../lib/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, NotebookText, Settings2 } from 'lucide-react-native';
import Flame from '../components/Flame';
import ScreenBg from '../components/ScreenBg';
import { GoldButton, IconButton } from '../components/ui';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from '../lib/store';
import { startHomeRefresh } from '../lib/homeRefresh';
import { fitFlameWidth } from '../lib/flameGeometry';
import { useVisibleScreen } from '../lib/useVisibleScreen';
import { bottomActionPadding, colors, column, fonts, sc, screenGutter, useStyles } from '../lib/theme';

const greetingByHour = (t: ReturnType<typeof useI18n>['t']) => {
  const h = new Date().getHours();
  if (h < 5) return t('screens.home.night');
  if (h < 12) return t('screens.home.morning');
  if (h < 18) return t('screens.home.afternoon');
  return t('screens.home.evening');
};

export default function Home() {
  const { t, language } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  // Home stays in the stack under the session: subscribing to the whole
  // store would re-render it on every tick of the timer.
  const { streak, loadStreak, reset } = useSession(
    useShallow((st) => ({ streak: st.streak, loadStreak: st.loadStreak, reset: st.reset })),
  );
  const { prayerSaved } = useLocalSearchParams<{ prayerSaved?: string }>();
  const [showSavedNotice, setShowSavedNotice] = useState(false);
  const visible = useVisibleScreen();
  // Heights of the central block and the captions under the flame: on short
  // windows the flame shrinks to the available space, otherwise the block
  // overflows and the captions collide with the button. The flame itself
  // is not measured.
  const [centerHeight, setCenterHeight] = useState<number>();
  const [captionsHeight, setCaptionsHeight] = useState<number>();
  const onCenterLayout = (e: LayoutChangeEvent) => setCenterHeight(e.nativeEvent.layout.height);
  const onCaptionsLayout = (e: LayoutChangeEvent) => setCaptionsHeight(e.nativeEvent.layout.height);

  useEffect(() => {
    if (prayerSaved !== '1') return;
    setShowSavedNotice(true);
    // The banner does not announce itself; queue it so the screen-change
    // announcement does not cut it off.
    AccessibilityInfo.announceForAccessibilityWithOptions(t('screens.home.prayerSaved'), { queue: true });
    // Consume the one-shot message so it does not repeat on return.
    router.setParams({ prayerSaved: undefined });
  }, [prayerSaved]);

  useEffect(() => {
    if (!showSavedNotice || !visible) return;
    const timer = setTimeout(() => setShowSavedNotice(false), 4000);
    return () => clearTimeout(timer);
  }, [showSavedNotice, visible]);

  // The session resets only when navigating to Home; the calendar refreshes without navigation too.
  useFocusEffect(
    useCallback(() => {
      reset();
      return startHomeRefresh(AppState, loadStreak);
    }, [loadStreak, reset]),
  );

  // last week's calendar: the right dot is today, the left one is 6 days ago.
  // Prayed — gold, missed — dimmed, today not yet — a "pending" outline
  const dots = streak.week.map((prayed, i) => {
    if (prayed) return 'filled';
    return i === 6 ? 'today' : 'empty';
  });

  // The caption gently sums up the week and does not reset the streak after a miss.
  const weekDays = streak.week.filter(Boolean).length;
  const streakLine = weekDays > 0
    ? t(`screens.home.week.${pluralCategory(language, weekDays)}`, { count: weekDays })
    : '';

  const flameWidth = centerHeight === undefined || captionsHeight === undefined
    ? sc(240)
    : fitFlameWidth(sc(240), centerHeight - captionsHeight - styles.center.gap);

  return (
    <View style={styles.root}>
      <ScreenBg variant="home" />
      {/* no entering animation: on a cold start, while the JS thread is
          busy loading the bundle, FadeIn freezes at semi-transparency — the
          whole screen stays "washed out". Home is the first screen; it needs no fade-in */}
      <View style={styles.screen}>
        <View style={[styles.top, { top: insets.top + sc(18) }]}>
          <Text style={styles.greeting}>{greetingByHour(t)}</Text>
          <View style={styles.topBtns}>
            <IconButton
              onPress={() => router.push('/journal')}
              size={sc(30)}
              bg="transparent"
              accessibilityLabel={t('screens.home.journal')}
              testID="journal-button"
            >
              <NotebookText size={sc(17)} color={colors.labelGold} strokeWidth={1.8} />
            </IconButton>
            <IconButton
              onPress={() => router.push('/favorites')}
              size={sc(30)}
              bg="transparent"
              accessibilityLabel={t('screens.favorites.title')}
              testID="favorites-button"
            >
              <Heart size={sc(17)} color={colors.labelGold} strokeWidth={1.8} />
            </IconButton>
            <IconButton
              onPress={() => router.push('/settings')}
              size={sc(30)}
              bg="transparent"
              accessibilityLabel={t('screens.home.settings')}
              testID="settings-button"
            >
              <Settings2 size={sc(17)} color={colors.labelGold} strokeWidth={1.8} />
            </IconButton>
          </View>
        </View>

        <View style={styles.center} onLayout={onCenterLayout}>
          {/* the flame always burns; before prayer it is slightly dimmer
              (lit=false), after — at full strength: "keep the flame" becomes literal */}
          <Flame width={flameWidth} lit={streak.prayedToday} />
          <View style={styles.captions} onLayout={onCaptionsLayout}>
            <Text
              style={styles.title}
              testID={streak.prayedToday ? 'home-title-lit' : 'home-title'}
            >
              {streak.prayedToday ? t('screens.home.lit') : t('screens.home.keepFlame')}
            </Text>
            <View style={styles.dotsRow}>
              {dots.map((kind, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    kind === 'filled' && styles.dotFilled,
                    kind === 'today' && styles.dotToday,
                  ]}
                />
              ))}
            </View>
            <Text
              key={showSavedNotice ? 'saved-notice' : 'streak-caption'}
              style={styles.streakLabel}
              numberOfLines={1}
              testID={showSavedNotice ? 'prayer-saved-notice' : 'home-streak-line'}
              accessible={showSavedNotice || !!streakLine}
              importantForAccessibility={showSavedNotice || streakLine ? 'auto' : 'no'}
              accessibilityElementsHidden={!showSavedNotice && !streakLine}
            >
              {showSavedNotice ? t('screens.home.prayerSaved') : streakLine || ' '}
            </Text>
          </View>
        </View>

        <View style={[styles.bottom, { paddingBottom: bottomActionPadding(insets.bottom) }]}>
          <GoldButton label={t('screens.home.start')} testID="start-prayer-button" onPress={() => router.navigate('/setup')} />
        </View>
      </View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  screen: { flex: 1, ...column() },
  top: {
    position: 'absolute',
    left: screenGutter(),
    right: screenGutter(),
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(15),
    color: colors.creamDim,
  },
  topBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(6),
  },
  center: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
  },
  captions: {
    alignItems: 'center',
    gap: sc(8),
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: sc(26),
    color: colors.cream,
    marginTop: sc(12),
  },
  dotsRow: {
    flexDirection: 'row',
    gap: sc(4),
    alignItems: 'center',
    marginTop: sc(14),
  },
  // missed day: ash-grey, no gold
  dot: {
    width: sc(8),
    height: sc(8),
    borderRadius: sc(4),
    backgroundColor: 'rgba(200,185,160,.16)',
  },
  dotFilled: {
    width: sc(7),
    height: sc(7),
    backgroundColor: colors.gold,
  },
  dotToday: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,200,90,.55)',
  },
  streakLabel: {
    fontFamily: fonts.mono,
    fontSize: sc(11),
    lineHeight: sc(16),
    color: colors.labelGold,
    marginTop: sc(4),
  },
  // The button sits in the flow, not on top of the screen: the central block
  // must receive the remaining height, otherwise on short windows the flame
  // with its captions centers against the whole screen and overlaps the button.
  bottom: {
    paddingHorizontal: screenGutter(),
  },
});
