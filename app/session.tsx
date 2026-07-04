import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import BottomSheet from '@gorhom/bottom-sheet';
import ScreenBg from '../components/ScreenBg';
import ProgressRing from '../components/ProgressRing';
import CompanionDock from '../components/CompanionDock';
import AnswerSheet from '../components/AnswerSheet';
import ScriptureReader from '../components/ScriptureReader';
import { IconButton, Kicker } from '../components/ui';
import { Close } from '../components/icons';
import { fmtTime, useSession } from '../lib/store';
import { colors, fonts, radius } from '../lib/theme';

export default function Session() {
  useKeepAwake(); // экран не гаснет во время молитвы
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const answerRef = useRef<BottomSheet>(null);
  const readerRef = useRef<BottomSheet>(null);
  const flushAnswerRef = useRef<(() => Promise<void>) | null>(null);
  const ringProgress = useSharedValue(0);
  const finished = useRef(false);
  const finishTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // секундный тик
  useEffect(() => {
    const id = setInterval(() => useSession.getState().tick(), 1000);
    return () => {
      clearInterval(id);
      if (finishTimeout.current) clearTimeout(finishTimeout.current);
    };
  }, []);

  // Android «назад» не должен срывать молитву — глотаем жест
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const goToReflect = async () => {
    // открытый черновик ответа дописывается, а не выбрасывается
    if (flushAnswerRef.current) await flushAnswerRef.current();
    s.finish();
    router.replace('/reflect');
  };

  // конец таймера → рефлексия
  useEffect(() => {
    if (s.remaining === 0 && !finished.current) {
      finished.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finishTimeout.current = setTimeout(goToReflect, 400);
    }
  }, [s.remaining]);

  // кольцо: доля прошедшего времени (или минутный цикл в ∞-режиме)
  useEffect(() => {
    if (s.remaining === null) {
      const inMinute = s.elapsed % 60;
      if (inMinute === 0) {
        ringProgress.value = 0; // мгновенный сброс вместо анимации «назад»
      } else {
        ringProgress.value = withTiming(inMinute / 60, { duration: 1000 });
      }
    } else {
      const total = s.minutes * 60 || 1;
      ringProgress.value = withTiming(1 - s.remaining / Math.max(total, s.remaining), {
        duration: 1000,
      });
    }
  }, [s.remaining, s.elapsed]);

  const finishEarly = () => {
    if (finished.current) return;
    finished.current = true;
    goToReflect();
  };

  const timerLabel = s.remaining === null ? fmtTime(s.elapsed) : fmtTime(s.remaining);
  const timerSub = s.remaining === null ? 'свободная молитва' : 'осталось';

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
        {/* top bar */}
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          <IconButton onPress={finishEarly}>
            <Close />
          </IconButton>
          <Kicker numberOfLines={1} style={styles.topTitle}>
            Молитвенный поиск
          </Kicker>
          {/* симметричная заглушка вместо кнопки музыки: воспроизведение
              ещё не реализовано, а неработающая кнопка хуже её отсутствия */}
          <View style={{ width: 34 }} />
        </View>

        {/* таймер */}
        <View style={[styles.timerWrap, { marginTop: insets.top + 64 }]}>
          <ProgressRing size={208} strokeWidth={3} progress={ringProgress} />
          <View style={styles.timerContent}>
            <Pressable
              onPress={() => {
                if (s.remaining === null) return;
                Haptics.selectionAsync();
                setAdjustOpen((v) => !v);
              }}
            >
              <Text
                style={[
                  styles.timerText,
                  s.remaining !== null && styles.timerTextAdjustable,
                ]}
              >
                {timerLabel}
              </Text>
            </Pressable>
            <Kicker style={{ fontSize: 10 }}>{timerSub}</Kicker>
          </View>
          {adjustOpen && s.remaining !== null && (
            <>
              <AdjustBtn side="left" label="−5" onPress={() => s.adjustTimer(-5)} />
              <AdjustBtn side="right" label="+5" accent onPress={() => s.adjustTimer(5)} />
            </>
          )}
        </View>

        {/* цель */}
        {!!s.topic.trim() && (
          <View style={styles.goalWrap}>
            <Kicker style={{ fontSize: 9, color: colors.labelGoldDim, marginBottom: 5 }}>
              цель
            </Kicker>
            <Text style={styles.goalText} numberOfLines={3}>
              {s.goalPhrase || s.topic.trim()}
            </Text>
          </View>
        )}

        {/* карточка-спутник */}
        <View style={[styles.dockWrap, { bottom: insets.bottom + 14 }]}>
          <CompanionDock
            onOpenAnswer={() => answerRef.current?.snapToIndex(0)}
            onOpenReader={() => readerRef.current?.snapToIndex(0)}
          />
        </View>
      </Animated.View>

      <AnswerSheet sheetRef={answerRef} flushRef={flushAnswerRef} />
      <ScriptureReader sheetRef={readerRef} />
    </View>
  );
}

function AdjustBtn({
  side,
  label,
  accent,
  onPress,
}: {
  side: 'left' | 'right';
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      style={[styles.adjustBtnWrap, side === 'left' ? { left: -68 } : { right: -68 }]}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        style={({ pressed }) => [
          styles.adjustBtn,
          accent && styles.adjustBtnAccent,
          pressed && { transform: [{ scale: 0.9 }] },
        ]}
      >
        <Text style={[styles.adjustLabel, accent && { color: colors.amberBright }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  topBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    letterSpacing: 1.8,
  },
  timerWrap: {
    alignSelf: 'center',
    width: 208,
    height: 208,
  },
  timerContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timerText: {
    fontFamily: fonts.serif,
    fontSize: 48,
    lineHeight: 54,
    color: '#f6ecd4',
  },
  timerTextAdjustable: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(214,182,120,.38)',
    borderStyle: 'dashed',
    paddingBottom: 3,
  },
  adjustBtnWrap: {
    position: 'absolute',
    top: 82,
  },
  adjustBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.btnGoldBorderDim,
  },
  adjustBtnAccent: {
    backgroundColor: 'rgba(230,162,60,.12)',
    borderColor: 'rgba(230,162,60,.34)',
  },
  adjustLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: 'rgba(231,207,149,.8)',
  },
  goalWrap: {
    marginTop: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  goalText: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(243,238,226,.85)',
    textAlign: 'center',
  },
  dockWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
  },
});
