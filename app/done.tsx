import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ScreenBg from '../components/ScreenBg';
import Flame from '../components/Flame';
import { GoldButton, Kicker } from '../components/ui';
import { useSession } from '../lib/store';
import { colors, fonts } from '../lib/theme';

export default function Done() {
  const insets = useSafeAreaInsets();
  const s = useSession();

  return (
    <View style={styles.root}>
      <ScreenBg variant="home" />
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[styles.body, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.center}>
          <Flame width={220} lit />
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.textBlock}>
            <Text style={styles.title}>Огонёк горит</Text>
            <Text style={styles.streakLine}>
              {s.streak.count}-й день, как ты возвращаешься
            </Text>
            {!!s.takeaway && (
              <View style={styles.takeawayCard}>
                <Kicker style={{ fontSize: 10, marginBottom: 8 }}>ты вынес из молитвы</Kicker>
                <Text style={styles.takeawayText}>«{s.takeaway}»</Text>
              </View>
            )}
          </Animated.View>
        </View>
        <GoldButton label="На главную" onPress={() => router.dismissAll()} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginTop: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.cream,
  },
  streakLine: {
    marginTop: 7,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: 'rgba(255,225,180,.5)',
  },
  takeawayCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    maxWidth: 300,
  },
  takeawayText: {
    fontFamily: fonts.serifRegular,
    fontSize: 16,
    lineHeight: 23,
    color: '#e8ddc6',
    textAlign: 'center',
  },
});
