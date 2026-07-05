import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { ChevronLeft } from '../components/icons';
import { useSettings } from '../lib/settings';
import { colors, fonts, radius, sc } from '../lib/theme';

// Переключатель в стилистике приложения: пилюля с золотым «огоньком»
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
      hitSlop={8}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { shareAnswers, load, setShareAnswers } = useSettings();

  useEffect(() => {
    load();
  }, []);

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
        <View style={[styles.top, { top: insets.top + sc(10) }]}>
          <IconButton onPress={() => router.back()}>
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>Настройки</Kicker>
          <View style={{ width: sc(34) }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + sc(64),
            paddingHorizontal: sc(18),
            paddingBottom: insets.bottom + sc(24),
          }}
        >
          <Kicker style={styles.sectionKicker}>Спутник</Kicker>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: sc(12) }}>
                <Text style={styles.rowTitle}>Учитывать мои ответы</Text>
                <Text style={styles.rowSub}>
                  Спутник будет опираться на то, что ты пишешь во время молитвы,
                  подбирая следующие вопросы и места Писания.
                </Text>
              </View>
              <Toggle value={shareAnswers} onChange={setShareAnswers} />
            </View>

            <View style={styles.divider} />

            <Text style={styles.disclaimer}>
              {shareAnswers
                ? 'Текст твоих ответов будет отправляться на сервер вместе с запросом к ИИ — только ради подбора вопросов, он не сохраняется и не используется иначе. Выключи, и записи снова останутся только на устройстве.'
                : 'Сейчас твои ответы не покидают устройство. Если включить, их текст будет отправляться на сервер вместе с запросом к ИИ — вопросы станут внимательнее к тому, что ты пишешь.'}
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  top: {
    position: 'absolute',
    left: sc(12),
    right: sc(12),
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionKicker: {
    marginBottom: sc(8),
    marginLeft: sc(4),
  },
  card: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.22)',
    borderRadius: radius.md,
    padding: sc(14),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13.5),
    color: colors.parchment,
    marginBottom: sc(4),
  },
  rowSub: {
    fontFamily: fonts.sans,
    fontSize: sc(11),
    lineHeight: sc(15.5),
    color: colors.creamDim,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(214,182,120,.16)',
    marginVertical: sc(12),
  },
  disclaimer: {
    fontFamily: fonts.sans,
    fontSize: sc(10.5),
    lineHeight: sc(15),
    color: colors.warmHint,
  },
  toggle: {
    width: sc(40),
    height: sc(24),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,.08)',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.26)',
    padding: sc(3),
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: 'rgba(230,162,60,.32)',
    borderColor: 'rgba(230,162,60,.6)',
  },
  knob: {
    width: sc(16),
    height: sc(16),
    borderRadius: 999,
    backgroundColor: 'rgba(240,225,195,.55)',
  },
  knobOn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.amberBright,
  },
});
