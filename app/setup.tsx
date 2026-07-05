import React, { useState } from 'react';
import {
  Keyboard,
  Modal,
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
import { colors, fonts, radius, sc } from '../lib/theme';

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
        style={[styles.body, { paddingTop: insets.top + sc(12), paddingBottom: insets.bottom + sc(24) }]}
      >
        {/* элементы не двигаются под клавиатуру: она открывается поверх,
            а тап по пустому месту экрана её прячет */}
        <Pressable
          onPress={Keyboard.dismiss}
          accessible={false}
          style={{ flex: 1, justifyContent: 'space-between' }}
        >
          <View style={styles.headerRow}>
            <IconButton size={sc(30)} onPress={() => router.back()}>
              <ChevronLeft size={18} color={colors.white65} />
            </IconButton>
            <Kicker style={{ fontSize: sc(11) }}>Перед молитвой</Kicker>
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
              // без плейсхолдера: заголовок «Цель молитвы» и примеры под «?»
              // говорят достаточно, а любая подсказка навязывала тон
              style={styles.topicInput}
              // цель — одна фраза, переносы строк не нужны: клавиша ввода
              // становится синей «Готово» и закрывает клавиатуру
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          <View>
            <Kicker style={{ fontSize: sc(11), marginBottom: sc(12), marginHorizontal: 2 }}>
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
                        p.v === 0 && { fontSize: sc(18) },
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
        </Pressable>
      </Animated.View>

      <Modal visible={examplesOpen} transparent animationType="fade" onRequestClose={() => setExamplesOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setExamplesOpen(false)}>
          <View style={[styles.examplesCard, { marginTop: insets.top + sc(92) }]}>
            <Kicker style={{ marginBottom: sc(8) }}>Примеры целей · нажми, чтобы выбрать</Kicker>
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
  body: { flex: 1, paddingHorizontal: sc(18) },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginLeft: -4,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: sc(8),
  },
  goalTitle: {
    fontFamily: fonts.serif,
    fontSize: sc(21),
    color: colors.cream,
  },
  helpBtn: {
    width: sc(23),
    height: sc(23),
    borderRadius: sc(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.45)',
  },
  helpBtnLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: sc(13),
    color: colors.amber,
  },
  topicInput: {
    minHeight: sc(120),
    padding: sc(13),
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.white10,
    color: colors.parchment,
    fontSize: sc(16),
    lineHeight: sc(24),
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
    width: sc(60),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnLeft: { borderRightWidth: 1, borderRightColor: colors.white08 },
  stepBtnRight: { borderLeftWidth: 1, borderLeftColor: colors.white08 },
  stepValue: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: sc(8),
  },
  stepBig: {
    fontFamily: fonts.serif,
    fontSize: sc(36),
    // у Spectral высокие цифры: lineHeight ниже ~1.25 em срезает их сверху
    lineHeight: sc(45),
    color: colors.creamBright,
  },
  stepUnit: {
    fontFamily: fonts.sans,
    fontSize: sc(11),
    color: colors.creamDim,
    marginTop: -3,
  },
  presets: {
    flexDirection: 'row',
    gap: sc(8),
    marginTop: sc(12),
  },
  preset: {
    flex: 1,
    height: sc(30),
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
    fontSize: sc(12),
    color: colors.creamDim,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
  },
  examplesCard: {
    marginHorizontal: sc(18),
    padding: sc(12),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(26,20,14,.98)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.32)',
  },
  exampleRow: {
    padding: sc(11),
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.white08,
    marginBottom: sc(8),
  },
  exampleText: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(14),
    lineHeight: sc(19),
    color: colors.parchment,
  },
});
