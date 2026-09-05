import { useI18n, pluralCategory } from '../lib/i18n';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, NotebookText, Settings2 } from 'lucide-react-native';
import Flame from '../components/Flame';
import ScreenBg from '../components/ScreenBg';
import { GoldButton, IconButton } from '../components/ui';
import { useSession } from '../lib/store';
import { colors, column, fonts, sc, useStyles } from '../lib/theme';

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
  const { streak, loadStreak, reset } = useSession();

  // при каждом возврате на Home: сброс сессии + свежий стрик
  useFocusEffect(
    useCallback(() => {
      reset();
      loadStreak();
    }, []),
  );

  // календарь последней недели: правая точка — сегодня, левая — 6 дней назад.
  // Молился — золотая, пропустил — потухшая, сегодня ещё нет — контур «ждёт»
  const dots = streak.week.map((prayed, i) => {
    if (prayed) return 'filled';
    return i === 6 ? 'today' : 'empty';
  });

  // Подпись мягко суммирует неделю и не обнуляет достижение после пропуска.
  const weekDays = streak.week.filter(Boolean).length;
  const streakLine = weekDays > 0
    ? t(`screens.home.week.${pluralCategory(language, weekDays)}`, { count: weekDays })
    : '';

  return (
    <View style={styles.root}>
      <ScreenBg variant="home" />
      {/* без entering-анимации: на холодном старте, пока JS-поток занят
          загрузкой бандла, FadeIn замирает на полупрозрачности — весь экран
          остаётся «бледным». Home — первый экран, ему проявление не нужно */}
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

        <View style={styles.center}>
          {/* пламя горит всегда; до молитвы — чуть скромнее (lit=false),
              после — в полную силу: «поддержи» обретает буквальный смысл */}
          <Flame width={sc(240)} lit={streak.prayedToday} />
          <Text style={styles.title}>
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
          {!!streakLine && <Text style={styles.streakLabel}>{streakLine}</Text>}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + sc(24) }]}>
          <GoldButton label={t('screens.home.start')} onPress={() => router.push('/setup')} />
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
    left: sc(18),
    right: sc(18),
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
    alignItems: 'center',
    justifyContent: 'center',
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
  // потухший день: пепельный, без золота
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
    color: colors.labelGold,
    marginTop: sc(4),
  },
  // Кнопка стоит в потоке, а не поверх экрана: центральный блок должен
  // получать оставшуюся высоту, иначе на низком окне огонёк с подписями
  // центрируется по всему экрану и наезжает на кнопку.
  bottom: {
    paddingHorizontal: sc(18),
  },
});
