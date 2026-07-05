import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Circle, Group, RadialGradient, vec } from '@shopify/react-native-skia';
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
import { colors, fonts, radius, sc } from '../lib/theme';

// Кольцо таймера. В прототипе 208 px, но при честном масштабе круг
// выходит на весь экран и «теряет» содержимое — держим компактнее,
// цифры при том же кегле заполняют его гармоничнее.
const RING = sc(172);
// запас холста вокруг кольца под гало
const HALO_PAD = sc(56);

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
  const timerSub = s.remaining === null ? 'идёт' : 'осталось';
  // у конца (меньше 5 мин) — шаг 1 минута, как в прототипе
  const adjStep = s.remaining !== null && s.remaining < 300 ? 1 : 5;

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
        {/* top bar */}
        <View style={[styles.topBar, { top: insets.top + sc(8) }]}>
          <IconButton onPress={finishEarly}>
            <Close />
          </IconButton>
          <Kicker numberOfLines={1} style={styles.topTitle}>
            Молитва
          </Kicker>
          {/* симметричная заглушка вместо кнопки музыки: воспроизведение
              ещё не реализовано, а неработающая кнопка хуже её отсутствия */}
          <View style={{ width: sc(34) }} />
        </View>

        {/* таймер */}
        <View style={[styles.timerWrap, { marginTop: insets.top + sc(64) }]}>
          <TimerHalo />
          <ProgressRing size={RING} strokeWidth={3} progress={ringProgress} />
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
            <Kicker style={{ fontSize: sc(10) }}>{timerSub}</Kicker>
          </View>
          {adjustOpen && s.remaining !== null && (
            <>
              <AdjustBtn side="left" label={`−${adjStep}`} onPress={() => s.adjustTimer(-adjStep)} />
              <AdjustBtn side="right" label={`+${adjStep}`} accent onPress={() => s.adjustTimer(adjStep)} />
            </>
          )}
        </View>

        {/* цель */}
        <View style={styles.goalWrap}>
          <Kicker style={{ fontSize: sc(9), color: colors.labelGoldDim, marginBottom: sc(5) }}>
            цель
          </Kicker>
          <Text style={styles.goalText} numberOfLines={3}>
            {s.topic.trim() || s.goalPhrase || 'Свободная молитва — без конкретной темы'}
          </Text>
        </View>

        {/* карточка-спутник */}
        <View style={[styles.dockWrap, { bottom: insets.bottom + sc(14) }]}>
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

// тёплое дыхание за кольцом — halo 7s из прототипа
function TimerHalo() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);
  const size = RING + HALO_PAD * 2;
  const r = size / 2;
  const transform = useDerivedValue(() => [{ scale: 1 + t.value * 0.16 }]);
  const opacity = useDerivedValue(() => 0.62 + t.value * 0.38);
  const c = vec(r, r);
  return (
    <Canvas
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -HALO_PAD,
        left: -HALO_PAD,
        width: size,
        height: size,
      }}
    >
      <Group origin={c} transform={transform} opacity={opacity}>
        <Circle cx={r} cy={r} r={r}>
          <RadialGradient
            c={c}
            r={r}
            colors={['rgba(230,162,60,.14)', 'rgba(230,162,60,0)']}
            positions={[0, 0.68]}
          />
        </Circle>
      </Group>
    </Canvas>
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
      style={[styles.adjustBtnWrap, side === 'left' ? { left: -sc(68) } : { right: -sc(68) }]}
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
    left: sc(14),
    right: sc(14),
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sc(8),
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: sc(10),
    letterSpacing: sc(1.8),
  },
  timerWrap: {
    alignSelf: 'center',
    width: RING,
    height: RING,
  },
  timerContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(4),
  },
  timerText: {
    fontFamily: fonts.serif,
    fontSize: sc(48),
    lineHeight: sc(54),
    color: colors.creamBright,
  },
  timerTextAdjustable: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(214,182,120,.38)',
    borderStyle: 'dashed',
    paddingBottom: 3,
  },
  adjustBtnWrap: {
    position: 'absolute',
    top: RING / 2 - sc(22), // по вертикальному центру кольца
  },
  adjustBtn: {
    width: sc(44),
    height: sc(44),
    borderRadius: sc(22),
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
    fontSize: sc(12),
    color: colors.goldSoft,
  },
  goalWrap: {
    marginTop: sc(16),
    paddingHorizontal: sc(24),
    alignItems: 'center',
  },
  goalText: {
    fontFamily: fonts.serifItalic,
    fontSize: sc(14),
    lineHeight: sc(20),
    color: colors.body,
    textAlign: 'center',
  },
  dockWrap: {
    position: 'absolute',
    left: sc(18),
    right: sc(18),
  },
});
