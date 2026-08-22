import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ScreenBg from '../components/ScreenBg';
import Flame from '../components/Flame';
import { GoldButton, Kicker } from '../components/ui';
import { useSession } from '../lib/store';
import { colors, fonts, radius, sc } from '../lib/theme';

export default function Done() {
  const sessionId = useSession((state) => state.sessionId);

  if (sessionId === null) return <Redirect href="/" />;

  return <DoneScreen />;
}

function DoneScreen() {
  const insets = useSafeAreaInsets();
  const s = useSession();

  return (
    <View style={styles.root}>
      <ScreenBg variant="home" />
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[styles.body, { paddingTop: insets.top, paddingBottom: insets.bottom + sc(24) }]}
      >
        <View style={styles.center}>
          <Flame width={sc(220)} lit />
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.textBlock}>
            <Text style={styles.title}>Огонёк горит</Text>
            <Text style={styles.streakLine}>
              {s.streak.count}-й день, как ты возвращаешься
            </Text>
            {!!s.takeaway && (
              <View style={styles.takeawayCard}>
                <Kicker style={{ fontSize: sc(10), marginBottom: sc(8) }}>ты вынес из молитвы</Kicker>
                <Text style={styles.takeawayText}>«{s.takeaway}»</Text>
              </View>
            )}
          </Animated.View>
        </View>
        {/* после хот-релоада или деп-линка стек может быть пуст —
            тогда dismissAll молча ничего не делает */}
        <GoldButton
          label="На главную"
          onPress={() => (router.canDismiss() ? router.dismissAll() : router.replace('/'))}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  body: {
    flex: 1,
    paddingHorizontal: sc(18),
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginTop: sc(8),
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: sc(26),
    color: colors.cream,
  },
  streakLine: {
    marginTop: sc(7),
    fontFamily: fonts.sans,
    fontSize: sc(13),
    color: colors.creamDim,
  },
  takeawayCard: {
    marginTop: sc(20),
    padding: sc(14),
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    maxWidth: sc(300),
  },
  takeawayText: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(16),
    lineHeight: sc(23),
    color: colors.parchment,
    textAlign: 'center',
  },
});
