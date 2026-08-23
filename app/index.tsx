import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Flame from '../components/Flame';
import ScreenBg from '../components/ScreenBg';
import { GoldButton, IconButton } from '../components/ui';
import { Book, Gear } from '../components/icons';
import { useSession } from '../lib/store';
import { colors, fonts, sc } from '../lib/theme';

const greetingByHour = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Тихой ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
};

export default function Home() {
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

  // подпись согласована с точками: горит — серия, ждёт — итог недели
  const weekDays = streak.week.filter(Boolean).length;
  const dayWord = (n: number) => (n === 1 ? 'день' : n < 5 ? 'дня' : 'дней');
  const streakLine = streak.prayedToday
    ? `${streak.count}-й день подряд`
    : weekDays > 0
      ? `${weekDays} ${dayWord(weekDays)} за неделю`
      : '';

  return (
    <View style={styles.root}>
      <ScreenBg variant="home" />
      {/* без entering-анимации: на холодном старте, пока JS-поток занят
          загрузкой бандла, FadeIn замирает на полупрозрачности — весь экран
          остаётся «бледным». Home — первый экран, ему проявление не нужно */}
      <View style={{ flex: 1 }}>
        <View style={[styles.top, { top: insets.top + sc(18) }]}>
          <Text style={styles.greeting}>{greetingByHour()}</Text>
          <View style={styles.topBtns}>
            <IconButton onPress={() => router.push('/journal')} size={sc(30)}>
              <Book size={15} color={colors.labelGold} />
            </IconButton>
            <IconButton onPress={() => router.push('/settings')} size={sc(30)}>
              <Gear color={colors.labelGold} />
            </IconButton>
          </View>
        </View>

        <View style={styles.center}>
          {/* пламя горит всегда; до молитвы — чуть скромнее (lit=false),
              после — в полную силу: «поддержи» обретает буквальный смысл */}
          <Flame width={sc(240)} lit={streak.prayedToday} />
          <Text style={styles.title}>
            {streak.prayedToday ? 'Огонёк горит' : 'Поддержи огонёк'}
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

        <View style={[styles.bottom, { bottom: insets.bottom + sc(24) }]}>
          <GoldButton label="Начать молитву" onPress={() => router.push('/setup')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
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
    width: sc(6),
    height: sc(6),
    borderRadius: sc(3),
    backgroundColor: 'rgba(200,185,160,.16)',
  },
  dotFilled: {
    width: sc(7),
    height: sc(7),
    borderRadius: sc(4),
    backgroundColor: colors.gold,
  },
  dotToday: {
    width: sc(9),
    height: sc(9),
    borderRadius: sc(5),
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
  bottom: {
    position: 'absolute',
    left: sc(18),
    right: sc(18),
  },
});
