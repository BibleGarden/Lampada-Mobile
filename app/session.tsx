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
  useAnimatedStyle,
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
  useAudioPlayer,
  useAudioPlayerStatus,
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
import { getPrayerTracks } from '../lib/music';
import { colors, column, fonts, isTablet, sc, useStyles } from '../lib/theme';
import { useScriptureAudio } from '../lib/useScriptureAudio';
import { stopPrayerSystemTimer } from '../lib/prayerSystemTimer';

// Кольцо ограничиваем не только шириной, как остальные токены прототипа,
// но и высотой окна. Иначе на широком невысоком iPhone оно съедает всё
// пространство между шапкой и карточкой спутника.
// На планшете доля высоты больше: там кольцу есть куда расти, и в телефонном
// размере оно теряется посреди экрана.
const ringSizeFor = (height: number) =>
  Math.round(
    isTablet() ? Math.min(sc(230), height * 0.25) : Math.min(sc(146), height * 0.215),
  );

export default function Session() {
  const sessionId = useSession((state) => state.sessionId);

  if (sessionId === null) return <Redirect href="/" />;

  return <SessionScreen />;
}

function SessionScreen() {
  const styles = useStyles(stylesFactory);
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
  const [musicTracks] = useState(getPrayerTracks);
  const musicTrackIndex = useRef(0);
  const musicPlayer = useAudioPlayer(musicTracks[0]?.source ?? null, {
    keepAudioSessionActive: true,
  });
  const musicStatus = useAudioPlayerStatus(musicPlayer);

  const setMusicLockScreen = useCallback(() => {
    const track = musicTracks[musicTrackIndex.current];
    if (!track) return;
    musicPlayer.setActiveForLockScreen(true, {
      title: track.title,
      artist: track.artist,
      albumTitle: 'Twinkler · тихая музыка',
    });
  }, [musicPlayer, musicTracks]);

  const releaseMusicSession = useCallback(() => {
    // setIsAudioActiveAsync действует глобально, поэтому не трогаем сессию,
    // если её не захватывал именно музыкальный плеер.
    if (!musicSessionActive.current) return Promise.resolve();
    musicSessionActive.current = false;
    musicPlayer.clearLockScreenControls();
    return setIsAudioActiveAsync(false).catch((error) => {
      musicSessionActive.current = true;
      console.warn('Не удалось освободить аудиосессию', error);
    });
  }, [musicPlayer]);

  useEffect(() => {
    // Фоновое сопровождение должно оставаться заметно тише речи и системных звуков.
    musicPlayer.volume = 0.28;
  }, [musicPlayer]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (nextState === 'active') useSession.getState().tick();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let active = true;
    const shouldPlay = s.musicOn && !transientAudioBusy;
    if (!shouldPlay) {
      musicPlayer.pause();
      musicPlayer.clearLockScreenControls();
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
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      if (active && !transientAudioBusyRef.current) {
        setMusicLockScreen();
        musicPlayer.play();
      }
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
  }, [musicPlayer, releaseMusicSession, s.musicOn, setMusicLockScreen, transientAudioBusy]);

  useEffect(() => {
    if (!musicStatus.didJustFinish || musicTracks.length === 0) return;
    musicTrackIndex.current = (musicTrackIndex.current + 1) % musicTracks.length;
    const track = musicTracks[musicTrackIndex.current];
    musicPlayer.replace(track.source);
    if (useSession.getState().musicOn && !transientAudioBusyRef.current) {
      setMusicLockScreen();
      musicPlayer.play();
    }
  }, [musicPlayer, musicStatus.didJustFinish, musicTracks, setMusicLockScreen]);

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
      if (busy) {
        musicPlayer.pause();
        musicPlayer.clearLockScreenControls();
      }
      setTransientAudioBusy(busy);
    },
    [musicPlayer],
  );
  const currentScripture = s.scrList[s.scrIndex];
  const scriptureAudio = useScriptureAudio({
    scripture: currentScripture,
    voice: s.scriptureVoice,
    enabled: s.dockMode === 'scripture' && appState === 'active',
    onAudioBusyChange: handleTransientAudioChange,
  });

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
    // useAudioPlayer освобождает native shared object при unmount, поэтому
    // останавливаем озвучку Писания синхронно до router.replace.
    scriptureAudio.stop();
    // Останавливаем плеер до router.replace: useAudioPlayer сам удалит
    // native shared object при unmount, и обращаться к нему из cleanup уже нельзя.
    musicPlayer.pause();
    musicPlayer.clearLockScreenControls();
    await stopPrayerSystemTimer().catch((error) => {
      console.warn('Не удалось остановить системный таймер молитвы', error);
    });
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
  // Звучащую музыку показывает сама кнопка: отдельный бейдж занимал строку
  // над таймером и прилипал к кольцу.
  const musicPlaying = s.musicOn && !transientAudioBusy && musicStatus.playing;

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
        {/* Шапка, кольцо, цель и карточка стоят одной колонкой с общим
            зазором; остаток высоты забирает карточка. */}
        <View
          style={[
            styles.sessionContent,
            {
              // Только отбивка от безопасной зоны: в альбоме на планшете
              // высота дефицитна, и каждая точка тут отнимается у карточки.
              paddingTop: insets.top + sc(2),
              paddingBottom: insets.bottom + sc(4),
            },
          ]}
        >
          <View style={styles.topBar}>
            <IconButton onPress={finishEarly}>
              <Close />
            </IconButton>
            <Kicker numberOfLines={1} style={styles.topTitle}>
              Молитва
            </Kicker>
            <View style={styles.musicBtnWrap}>
              {musicPlaying && <MusicPulse size={sc(34)} />}
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
          </View>

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

          <View style={styles.dockWrap}>
            <CompanionDock
              onOpenAnswer={() => openAnswerRef.current?.()}
              onOpenReader={() => readerRef.current?.snapToIndex(0)}
              scriptureAudio={scriptureAudio}
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
      <ScriptureReader sheetRef={readerRef} scriptureAudio={scriptureAudio} />
    </View>
  );
}

// Пока музыка звучит, кнопка тихо «дышит» тёплым ореолом — это и есть
// индикатор вместо отдельного бейджа под шапкой.
function MusicPulse({ size }: { size: number }) {
  const styles = useStyles(stylesFactory);
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.36 }],
    opacity: 0.4 - t.value * 0.3,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      // Ореол — единственный признак звучащей музыки, поэтому у него есть
      // и голосовой эквивалент вместо снятого бейджа.
      accessible
      accessibilityLabel="Музыка звучит"
      testID="music-playing"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors.amberBright,
          backgroundColor: 'rgba(230,162,60,.2)',
        },
        style,
      ]}
    />
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
  const styles = useStyles(stylesFactory);
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

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  topBar: {
    // Оптическая поправка к общему gap: зазор до кольца читается от строки
    // «Молитва», а она сидит по центру ряда — до низа кнопок ещё половина их
    // высоты, и геометрически равный отступ выглядит заметно больше.
    marginBottom: -sc(9),
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
  musicBtnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionContent: {
    flex: 1,
    ...column(),
    paddingHorizontal: sc(18),
    // Один зазор на все стыки: шапка → кольцо → цель → карточка. На телефоне
    // остатка нет — его целиком забирает карточка. На планшете карточка
    // ограничена, и space-between раздаёт остаток поровну между теми же
    // стыками: лишняя высота становится воздухом, а не пустой карточкой.
    justifyContent: 'space-between',
    gap: sc(22),
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
    // Та же поправка снизу: нижний leading строки цели съедает часть зазора.
    marginBottom: -sc(3),
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
    // Единственный растягивающийся блок: карточка добирает остаток высоты,
    // поэтому её габарит одинаков в режиме вопроса и Писания.
    // На планшете рост ограничен потолком — иначе под две строки вопроса
    // уходит половина экрана; всё, что выше потолка, `space-between` раздаёт
    // в зазоры. Сжиматься карточка обязана: в альбомной ориентации высоты
    // меньше, чем нужно даже минимальному набору.
    flexGrow: 1,
    flexShrink: 1,
    maxHeight: isTablet() ? sc(230) : undefined,
  },
});
