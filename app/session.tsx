import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Redirect, router } from 'expo-router';
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
import {
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlaylist,
  useAudioPlaylistStatus,
} from 'expo-audio';
import BottomSheet from '@gorhom/bottom-sheet';
import ScreenBg from '../components/ScreenBg';
import ProgressRing from '../components/ProgressRing';
import CompanionDock from '../components/CompanionDock';
import AnswerSheet from '../components/AnswerSheet';
import ScriptureReader from '../components/ScriptureReader';
import { IconButton, Kicker } from '../components/ui';
import { Close, Music } from '../components/icons';
import { fmtTime, useSession } from '../lib/store';
import { getPrayerTrackSources } from '../lib/music';
import { colors, fonts, radius, sc } from '../lib/theme';

// Кольцо ограничиваем не только шириной, как остальные токены прототипа,
// но и высотой окна. Иначе на широком невысоком iPhone оно съедает всё
// пространство между шапкой и карточкой спутника.
const ringSizeFor = (height: number) => Math.round(Math.min(sc(156), height * 0.235));

export default function Session() {
  const sessionId = useSession((state) => state.sessionId);

  if (sessionId === null) return <Redirect href="/" />;

  return <SessionScreen />;
}

function SessionScreen() {
  useKeepAwake(); // экран не гаснет во время молитвы
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ringSize = ringSizeFor(height);
  const s = useSession();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [transientAudioBusy, setTransientAudioBusy] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const answerRef = useRef<BottomSheet>(null);
  const openAnswerRef = useRef<(() => void) | null>(null);
  const readerRef = useRef<BottomSheet>(null);
  const flushAnswerRef = useRef<(() => Promise<void>) | null>(null);
  const ringProgress = useSharedValue(0);
  const finished = useRef(false);
  const finishTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicSessionActive = useRef(false);
  // React-effect cleanup happens later than the press handler. The ref lets an
  // already running music activation see recording/playback immediately.
  const transientAudioBusyRef = useRef(false);
  const [musicSources] = useState(getPrayerTrackSources);
  const musicPlaylist = useAudioPlaylist({
    sources: musicSources,
    loop: 'all',
  });
  const musicStatus = useAudioPlaylistStatus(musicPlaylist);

  const releaseMusicSession = useCallback(() => {
    // setIsAudioActiveAsync действует глобально, поэтому не трогаем сессию,
    // если её не захватывал именно музыкальный плейлист.
    if (!musicSessionActive.current) return Promise.resolve();
    musicSessionActive.current = false;
    return setIsAudioActiveAsync(false).catch((error) => {
      musicSessionActive.current = true;
      console.warn('Не удалось освободить аудиосессию', error);
    });
  }, []);

  useEffect(() => {
    // Фоновое сопровождение должно оставаться заметно тише речи и системных звуков.
    musicPlaylist.volume = 0.28;
  }, [musicPlaylist]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let active = true;
    const shouldPlay = s.musicOn && appState === 'active' && !transientAudioBusy;
    if (!shouldPlay) {
      musicPlaylist.pause();
      // Keep the global session active while this screen is mounted. A late
      // async deactivation can otherwise race with a newly started recorder.
      return () => {
        active = false;
      };
    }
    void (async () => {
      musicSessionActive.current = true;
      await setIsAudioActiveAsync(true);
      // Starting a recording invalidates this async activation. Without this
      // guard its late allowsRecording:false stops the native iOS recorder.
      if (!active || transientAudioBusyRef.current) return;
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'doNotMix',
      });
      if (active && !transientAudioBusyRef.current) musicPlaylist.play();
    })().catch((error) => {
      console.warn('Не удалось включить музыкальное сопровождение', error);
      if (active && !transientAudioBusyRef.current && useSession.getState().musicOn) {
        useSession.getState().toggleMusic();
      }
      if (active && !transientAudioBusyRef.current) void releaseMusicSession();
    });
    return () => {
      active = false;
    };
  }, [appState, musicPlaylist, releaseMusicSession, s.musicOn, transientAudioBusy]);

  useEffect(
    () => () => {
      void releaseMusicSession();
    },
    [releaseMusicSession],
  );

  const handleTransientAudioChange = useCallback(
    (busy: boolean) => {
      // Эта остановка синхронна: запись не должна ждать React-effect.
      transientAudioBusyRef.current = busy;
      if (busy) musicPlaylist.pause();
      setTransientAudioBusy(busy);
    },
    [musicPlaylist],
  );

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
    // Останавливаем плейлист до router.replace: useAudioPlaylist сам удалит
    // native shared object при unmount, и обращаться к нему из cleanup уже нельзя.
    musicPlaylist.pause();
    await releaseMusicSession();
    if (useSession.getState().musicOn) useSession.getState().toggleMusic();
    void s.finish();
    router.replace('/reflect');
  };

  // конец таймера → рефлексия
  useEffect(() => {
    if (s.remaining === 0 && !finished.current) {
      // Ноль на таймере не обрывает мысль: ждём явного сохранения или
      // закрытия шторки, включая активную голосовую запись.
      if (answerOpen) return;
      finished.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finishTimeout.current = setTimeout(goToReflect, 400);
    }
  }, [s.remaining, answerOpen]);

  // Если шторка начала открываться в 400-мс окне перед переходом,
  // запланированное завершение отменяется и ждёт ответа.
  useEffect(() => {
    if (s.remaining === 0 && answerOpen && finishTimeout.current) {
      clearTimeout(finishTimeout.current);
      finishTimeout.current = null;
      finished.current = false;
    }
  }, [s.remaining, answerOpen]);

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
  const timerSub =
    s.remaining === 0 && answerOpen
      ? 'закончи ответ'
      : s.remaining === null
        ? 'идёт'
        : 'осталось';
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
          <IconButton
            onPress={s.toggleMusic}
            bg={s.musicOn ? 'rgba(230,162,60,.16)' : colors.white05}
            border={s.musicOn ? 'rgba(230,162,60,.4)' : undefined}
            accessibilityLabel={s.musicOn ? 'Выключить тихую музыку' : 'Включить тихую музыку'}
            accessibilityState={{ selected: s.musicOn }}
          >
            <Music color={s.musicOn ? colors.amberBright : 'rgba(255,255,255,.5)'} />
          </IconButton>
        </View>

        <View
          style={[
            styles.sessionContent,
            {
              paddingTop: insets.top + sc(50),
              paddingBottom: insets.bottom + sc(14),
            },
          ]}
        >
          <View style={styles.musicSlot}>
            {s.musicOn && !transientAudioBusy && musicStatus.playing && (
              <Animated.View entering={FadeIn.duration(250)} style={styles.musicChip}>
                <Music size={11} color={colors.amberBright} />
                <Text style={styles.musicChipLabel} numberOfLines={1}>
                  Тихая музыка
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Таймер и цель делят свободную высоту поровну с отступами сверху и снизу. */}
          <View style={styles.focusArea}>
            <View style={[styles.timerWrap, { width: ringSize, height: ringSize }]}>
              <TimerHalo size={ringSize} />
              <ProgressRing size={ringSize} strokeWidth={3} progress={ringProgress} />
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
                      {
                        fontSize: ringSize * 0.255,
                        lineHeight: ringSize * 0.3,
                      },
                      s.remaining !== null && styles.timerTextAdjustable,
                    ]}
                  >
                    {timerLabel}
                  </Text>
                </Pressable>
                <Kicker style={{ fontSize: Math.min(sc(10), ringSize * 0.052) }}>
                  {timerSub}
                </Kicker>
              </View>
              {adjustOpen && s.remaining !== null && (
                <>
                  <AdjustBtn
                    ringSize={ringSize}
                    side="left"
                    label={`−${adjStep}`}
                    onPress={() => s.adjustTimer(-adjStep)}
                  />
                  <AdjustBtn
                    ringSize={ringSize}
                    side="right"
                    label={`+${adjStep}`}
                    accent
                    onPress={() => s.adjustTimer(adjStep)}
                  />
                </>
              )}
            </View>

            <View style={styles.goalWrap}>
              <Kicker style={{ fontSize: sc(9), color: colors.labelGoldDim, marginBottom: sc(5) }}>
                цель
              </Kicker>
              <Text style={styles.goalText} numberOfLines={3}>
                {s.topic.trim() || 'Свободная молитва — без конкретной темы'}
              </Text>
            </View>
          </View>

          <View style={styles.dockWrap}>
            <CompanionDock
              onOpenAnswer={() => openAnswerRef.current?.()}
              onOpenReader={() => readerRef.current?.snapToIndex(0)}
            />
          </View>
        </View>
      </Animated.View>

      <AnswerSheet
        sheetRef={answerRef}
        openRef={openAnswerRef}
        flushRef={flushAnswerRef}
        onEditingChange={setAnswerOpen}
        timeExpired={s.remaining === 0}
        onAudioBusyChange={handleTransientAudioChange}
      />
      <ScriptureReader sheetRef={readerRef} />
    </View>
  );
}

// тёплое дыхание за кольцом — halo 7s из прототипа
function TimerHalo({ size: ringSize }: { size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);
  const haloPad = Math.min(sc(48), ringSize * 0.28);
  const size = ringSize + haloPad * 2;
  const r = size / 2;
  const transform = useDerivedValue(() => [{ scale: 1 + t.value * 0.16 }]);
  const opacity = useDerivedValue(() => 0.62 + t.value * 0.38);
  const c = vec(r, r);
  return (
    <Canvas
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -haloPad,
        left: -haloPad,
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
  ringSize,
  side,
  label,
  accent,
  onPress,
}: {
  ringSize: number;
  side: 'left' | 'right';
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      style={[
        styles.adjustBtnWrap,
        { top: ringSize / 2 - sc(22) },
        side === 'left' ? { left: -sc(68) } : { right: -sc(68) },
      ]}
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
  musicChip: {
    maxWidth: '88%',
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(6),
    paddingHorizontal: sc(10),
    paddingVertical: sc(4),
    borderRadius: 999,
    backgroundColor: 'rgba(230,162,60,.1)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.24)',
  },
  musicChipLabel: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: sc(10.5),
    color: 'rgba(240,213,170,.8)',
  },
  sessionContent: {
    flex: 1,
    width: '100%',
    maxWidth: sc(360),
    alignSelf: 'center',
    paddingHorizontal: sc(18),
  },
  musicSlot: {
    minHeight: sc(28),
    marginBottom: -sc(30),
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusArea: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  timerWrap: {
    alignSelf: 'center',
  },
  timerContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(4),
  },
  timerText: {
    fontFamily: fonts.serif,
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
    width: '100%',
    paddingHorizontal: sc(12),
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
    width: '100%',
  },
});
