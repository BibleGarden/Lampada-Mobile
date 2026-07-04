import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import Flame from '../components/Flame';
import ScreenBg from '../components/ScreenBg';
import { GoldButton } from '../components/ui';
import { Bell } from '../components/icons';
import { useSession } from '../lib/store';
import { colors, fonts } from '../lib/theme';

// время тихого напоминания; пока фиксировано, как в прототипе —
// настройка появится вместе с expo-notifications
const REMINDER_TIME = '7:30';

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

  // 7 точек стрика: заполненные дни + сегодняшняя (контурная, пока не молился)
  const cap = Math.min(streak.count + (streak.prayedToday ? 0 : 1), 7);
  const dots = Array.from({ length: 7 }, (_, i) => {
    if (i < cap - 1 || (streak.prayedToday && i < cap)) return 'filled';
    if (i === cap - 1) return streak.prayedToday ? 'filled' : 'today';
    return 'empty';
  });

  return (
    <View style={styles.root}>
      <ScreenBg variant="home" />
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
        <View style={[styles.top, { top: insets.top + 18 }]}>
          <Text style={styles.greeting}>{greetingByHour()}</Text>
          <View style={styles.bellChip}>
            <Bell />
            <Text style={styles.bellLabel}>{REMINDER_TIME}</Text>
          </View>
        </View>

        <View style={styles.center}>
          <Flame width={240} lit={streak.prayedToday} />
          <Text style={styles.title}>
            {streak.prayedToday ? 'Лампада горит' : 'Зажги огонёк'}
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
          {streak.count > 0 && (
            <Text style={styles.streakLabel}>
              {streak.count}-й день подряд
            </Text>
          )}
        </View>

        <View style={[styles.bottom, { bottom: insets.bottom + 24 }]}>
          <GoldButton label="Начать молитву" onPress={() => router.push('/setup')} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  top: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontFamily: fonts.serifRegular,
    fontSize: 15,
    color: colors.creamDim,
  },
  bellChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bellLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: 'rgba(255,255,255,.3)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.cream,
    marginTop: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    marginTop: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(217,169,78,.25)',
  },
  dotFilled: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  dotToday: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,200,90,.55)',
  },
  streakLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: 'rgba(214,182,120,.5)',
    marginTop: 4,
  },
  bottom: {
    position: 'absolute',
    left: 18,
    right: 18,
  },
});
