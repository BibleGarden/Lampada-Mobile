import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import Flame from '../components/Flame';
import { GoldButton, Kicker } from '../components/ui';
import { Regen } from '../components/icons';
import { useSession } from '../lib/store';
import { colors, fonts, radius, sc } from '../lib/theme';

export default function Reflect() {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [takeaway, setTakeaway] = useState('');
  const completing = useRef(false);

  // Android «назад» тут некуда вести — только явное завершение
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const complete = async (saveText: string) => {
    if (completing.current) return; // двойной тап не должен завершать дважды
    completing.current = true;
    try {
      await s.complete(saveText);
      router.replace('/done');
    } catch (e) {
      completing.current = false;
      throw e;
    }
  };

  // свежий отсчёт, та же цель и длительность — как continuePraying в прототипе
  const continuePraying = async () => {
    if (completing.current) return;
    completing.current = true;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await s.enterSession();
      router.replace('/session');
    } finally {
      completing.current = false;
    }
  };

  const fallbackQ = s.topic.trim()
    ? 'Удалось ли то, с чем ты пришёл сегодня?'
    : 'Что ты вынес из этой молитвы?';

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View
        entering={FadeIn.duration(500)}
        style={[styles.body, { paddingTop: insets.top + sc(16), paddingBottom: insets.bottom + sc(24) }]}
      >
        {/* элементы не двигаются под клавиатуру: она открывается поверх,
            тап по пустому месту её прячет — как на «Настройке» */}
        <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ flex: 1 }}>
          {/* тёплый уголёк */}
          <View style={styles.emberWrap}>
            <Flame width={sc(104)} ember />
          </View>

          <View style={styles.questionBlock}>
            <Kicker style={{ textAlign: 'center', marginBottom: sc(10) }}>
              прежде чем закрыть
            </Kicker>
            <Text style={styles.question}>{s.reflectQ || fallbackQ}</Text>
          </View>

          <TextInput
            value={takeaway}
            onChangeText={setTakeaway}
            multiline
            placeholder="Одна-две строки…"
            placeholderTextColor="rgba(240,230,210,.3)"
            style={styles.input}
          />

          <View style={{ flex: 1, minHeight: sc(16) }} />

          <View style={{ gap: sc(12) }}>
            <GoldButton
              label={takeaway.trim() ? 'Сохранить и завершить' : 'Завершить'}
              onPress={() => complete(takeaway.trim())}
            />
            <Pressable
              onPress={continuePraying}
              style={({ pressed }) => [styles.continueBtn, pressed && { transform: [{ scale: 0.985 }] }]}
            >
              <Regen size={16} color={colors.amberBright} strokeWidth={1.7} />
              <Text style={styles.continueLabel}>Вернуться к молитве</Text>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: { flex: 1, paddingHorizontal: sc(18) },
  emberWrap: {
    alignItems: 'center',
  },
  questionBlock: {
    paddingHorizontal: sc(6),
    marginTop: sc(4),
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: sc(22),
    lineHeight: sc(29),
    color: '#f3e7cf',
    textAlign: 'center',
  },
  input: {
    marginTop: sc(20),
    height: sc(128),
    padding: sc(13),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.045)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.24)',
    color: '#f1e7d3',
    fontSize: sc(16),
    lineHeight: sc(24),
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
    paddingVertical: sc(12),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(230,162,60,.08)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.32)',
  },
  continueLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    color: colors.amberBright,
  },
});
