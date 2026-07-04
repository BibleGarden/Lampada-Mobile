import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { GoldButton, IconButton, Kicker } from '../components/ui';
import { ChevronLeft, Minus, Plus } from '../components/icons';
import { useSession } from '../lib/store';
import { colors, fonts, radius } from '../lib/theme';

const EXAMPLES = [
  'Привести мысли в порядок',
  'Принять важное решение',
  'Подготовиться к разговору',
  'Подготовиться к проповеди',
];

const PRESETS = [
  { label: '5', v: 5 },
  { label: '15', v: 15 },
  { label: '30', v: 30 },
  { label: 'час', v: 60 },
  { label: '∞', v: 0 },
];

export default function Setup() {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [examplesOpen, setExamplesOpen] = useState(false);

  const next = () => {
    s.prepareThreshold();
    router.push('/threshold');
  };

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View
        entering={FadeIn.duration(450)}
        style={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'space-between' }}
        >
          <View style={styles.headerRow}>
            <IconButton size={30} onPress={() => router.back()}>
              <ChevronLeft size={18} color={colors.white65} />
            </IconButton>
            <Kicker style={{ fontSize: 11 }}>Молитвенный поиск</Kicker>
          </View>

          <View>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>Цель молитвы</Text>
              <Pressable
                onPress={() => setExamplesOpen(true)}
                hitSlop={8}
                style={({ pressed }) => [styles.helpBtn, pressed && { transform: [{ scale: 0.92 }] }]}
              >
                <Text style={styles.helpBtnLabel}>?</Text>
              </Pressable>
            </View>
            <TextInput
              value={s.topic}
              onChangeText={s.setTopic}
              multiline
              placeholder="О чём хочешь помолиться?"
              placeholderTextColor="rgba(240,230,210,.3)"
              style={styles.topicInput}
            />
          </View>

          <View>
            <Kicker style={{ fontSize: 11, marginBottom: 12, marginHorizontal: 2 }}>
              Длительность
            </Kicker>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  s.decMinutes();
                }}
                style={({ pressed }) => [
                  styles.stepBtn,
                  styles.stepBtnLeft,
                  pressed && { backgroundColor: 'rgba(255,255,255,.07)' },
                ]}
              >
                <Minus color={colors.white65} />
              </Pressable>
              <View style={styles.stepValue}>
                <Text style={styles.stepBig}>{s.minutes === 0 ? '∞' : s.minutes}</Text>
                <Text style={styles.stepUnit}>
                  {s.minutes === 0 ? 'без таймера' : plUnit(s.minutes)}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  s.incMinutes();
                }}
                style={({ pressed }) => [
                  styles.stepBtn,
                  styles.stepBtnRight,
                  pressed && { backgroundColor: 'rgba(255,255,255,.07)' },
                ]}
              >
                <Plus color={colors.white65} />
              </Pressable>
            </View>
            <View style={styles.presets}>
              {PRESETS.map((p) => {
                const active = s.minutes === p.v;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() => {
                      Haptics.selectionAsync();
                      s.setMinutes(p.v);
                    }}
                    style={[styles.preset, active && styles.presetActive]}
                  >
                    <Text
                      style={[
                        styles.presetLabel,
                        p.v === 0 && { fontSize: 18 },
                        active && { color: colors.amberBright },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <GoldButton label="Далее" onPress={next} />
        </KeyboardAvoidingView>
      </Animated.View>

      <Modal visible={examplesOpen} transparent animationType="fade" onRequestClose={() => setExamplesOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setExamplesOpen(false)}>
          <View style={[styles.examplesCard, { marginTop: insets.top + 92 }]}>
            <Kicker style={{ marginBottom: 8 }}>Примеры целей · нажми, чтобы выбрать</Kicker>
            {EXAMPLES.map((ex) => (
              <Pressable
                key={ex}
                onPress={() => {
                  s.setTopic(ex);
                  setExamplesOpen(false);
                }}
                style={({ pressed }) => [styles.exampleRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.exampleText}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const plUnit = (n: number) => {
  const a = n % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'минут';
  if (b === 1) return 'минута';
  if (b >= 2 && b <= 4) return 'минуты';
  return 'минут';
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: { flex: 1, paddingHorizontal: 18 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: -4,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalTitle: {
    fontFamily: fonts.serif,
    fontSize: 21,
    color: colors.parchment,
  },
  helpBtn: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.45)',
  },
  helpBtnLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.amber,
  },
  topicInput: {
    minHeight: 120,
    padding: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.white10,
    color: '#f0e6d2',
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: colors.white10,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnLeft: { borderRightWidth: 1, borderRightColor: colors.white08 },
  stepBtnRight: { borderLeftWidth: 1, borderLeftColor: colors.white08 },
  stepValue: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  stepBig: {
    fontFamily: fonts.serif,
    fontSize: 36,
    lineHeight: 40,
    color: '#f6ecd4',
  },
  stepUnit: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.white45,
    marginTop: -3,
  },
  presets: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  preset: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.06)',
  },
  presetActive: {
    backgroundColor: 'rgba(230,162,60,.18)',
    borderColor: 'rgba(230,162,60,.4)',
  },
  presetLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.white45,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
  },
  examplesCard: {
    marginHorizontal: 18,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(26,20,14,.98)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.32)',
  },
  exampleRow: {
    padding: 11,
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.white08,
    marginBottom: 8,
  },
  exampleText: {
    fontFamily: fonts.serifRegular,
    fontSize: 14,
    lineHeight: 19,
    color: '#ece4d4',
  },
});
