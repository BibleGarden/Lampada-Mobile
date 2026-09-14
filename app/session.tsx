import { useI18n } from '../lib/i18n';
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
  FadeOut,
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
  type AudioStatus,
  useAudioPlayer,
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
import { scheduleSessionCompletion } from '../lib/sessionCompletion';
import {
  audioModeCoordinator,
  type AudioModeRequest,
} from '../lib/audioModeCoordinator';

const MUSIC_PLAYBACK_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix' as const,
};
const MUSIC_VOLUME = 0.28;
const MUSIC_CROSSFADE_MS = 2000;
const MUSIC_CROSSFADE_TICK_MS = 50;
const MUSIC_STATUS_UPDATE_MS = 200;
const MUSIC_CROSSFADE_LEAD_SECONDS = 2.2;
type MusicPlayerSlot = 0 | 1;

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
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  useKeepAwake(); // экран не гаснет во время молитвы
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ringSize = ringSizeFor(height);
  const s = useSession();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [showExpiryNotice, setShowExpiryNotice] = useState(false);
  const [transientAudioBusy, setTransientAudioBusy] = useState(false);
  const [musicPlayersPlaying, setMusicPlayersPlaying] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const answerRef = useRef<BottomSheet>(null);
  const openAnswerRef = useRef<(() => void) | null>(null);
  const readerRef = useRef<BottomSheet>(null);
  const flushAnswerRef = useRef<(() => Promise<void>) | null>(null);
  const ringProgress = useSharedValue(0);
  const timeExpired = s.remaining === 0;
  const expiryNotified = useRef(false);
  const finished = useRef(false);
  const musicSessionActive = useRef(false);
  // React-effect cleanup happens later than the press handler. The ref lets an
  // already running music activation see recording/playback immediately.
  const transientAudioBusyRef = useRef(false);
  const [musicTracks] = useState(getPrayerTracks);
  const musicTrackIndex = useRef(0);
  const activeMusicPlayerSlot = useRef<MusicPlayerSlot>(0);
  const musicCrossfadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicCrossfadeRunning = useRef(false);
  const musicPlayingBySlot = useRef<[boolean, boolean]>([false, false]);
  const loadedMusicTrackIndexes = useRef<[number, number]>([
    0,
    musicTracks.length > 1 ? 1 : 0,
  ]);
  const musicPlayerA = useAudioPlayer(musicTracks[0]?.source ?? null, {
    keepAudioSessionActive: true,
    updateInterval: MUSIC_STATUS_UPDATE_MS,
  });
  const musicPlayerB = useAudioPlayer(musicTracks[1]?.source ?? musicTracks[0]?.source ?? null, {
    keepAudioSessionActive: true,
    updateInterval: MUSIC_STATUS_UPDATE_MS,
  });

  const musicPlayerForSlot = useCallback(
    (slot: MusicPlayerSlot) => (slot === 0 ? musicPlayerA : musicPlayerB),
    [musicPlayerA, musicPlayerB],
  );

  const setMusicLockScreen = useCallback((slot: MusicPlayerSlot, trackIndex: number) => {
    const track = musicTracks[trackIndex];
    if (!track) return;
    musicPlayerForSlot(slot).setActiveForLockScreen(true, {
      title: track.title,
      artist: track.artist,
      albumTitle: t('screens.session.album'),
    });
  }, [musicPlayerForSlot, musicTracks, t]);

  const cancelMusicCrossfade = useCallback(() => {
    if (musicCrossfadeTimer.current) {
      clearInterval(musicCrossfadeTimer.current);
      musicCrossfadeTimer.current = null;
    }
    musicCrossfadeRunning.current = false;
    const activeSlot = activeMusicPlayerSlot.current;
    const activePlayer = musicPlayerForSlot(activeSlot);
    const standbyPlayer = musicPlayerForSlot(activeSlot === 0 ? 1 : 0);
    activePlayer.volume = MUSIC_VOLUME;
    standbyPlayer.pause();
    standbyPlayer.volume = 0;
    void standbyPlayer.seekTo(0).catch((error) => {
      console.warn('Failed to rewind the next music track', error);
    });
  }, [musicPlayerForSlot]);

  const pauseMusicPlayers = useCallback(() => {
    cancelMusicCrossfade();
    musicPlayerA.pause();
    musicPlayerB.pause();
    musicPlayerA.clearLockScreenControls();
    musicPlayerB.clearLockScreenControls();
  }, [cancelMusicCrossfade, musicPlayerA, musicPlayerB]);

  const applyMusicAudioMode = useCallback(async (mode: AudioModeRequest) => {
    // AVAudioSession activation is process-wide too. Keep it in the same queue
    // as mode changes so a quick next recording cannot call record() while a
    // late music activation is still reconfiguring the native session.
    musicSessionActive.current = true;
    await setIsAudioActiveAsync(true);
    await setAudioModeAsync(mode);
  }, []);

  const releaseMusicSession = useCallback(() => {
    // setIsAudioActiveAsync действует глобально, поэтому не трогаем сессию,
    // если её не захватывал именно музыкальный плеер.
    if (!musicSessionActive.current) return Promise.resolve();
    musicPlayerA.clearLockScreenControls();
    musicPlayerB.clearLockScreenControls();
    return audioModeCoordinator
      .requestDeactivation(() => setIsAudioActiveAsync(false))
      .then((deactivated) => {
        if (deactivated) musicSessionActive.current = false;
      })
      .catch((error) => console.warn('Failed to release audio session', error));
  }, [musicPlayerA, musicPlayerB]);

  useEffect(() => {
    // Фоновое сопровождение должно оставаться заметно тише речи и системных звуков.
    musicPlayerA.volume = MUSIC_VOLUME;
    musicPlayerB.volume = 0;
    musicPlayerB.pause();
  }, [musicPlayerA, musicPlayerB]);

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
      pauseMusicPlayers();
      // Keep the global session active while this screen is mounted. A late
      // async deactivation can otherwise race with a newly started recorder.
      return () => {
        active = false;
      };
    }
    void (async () => {
      const modeGrant = await audioModeCoordinator.requestPlayback(
        applyMusicAudioMode,
        MUSIC_PLAYBACK_MODE,
      );
      if (!modeGrant?.isCurrent()) return;
      if (
        active &&
        !transientAudioBusyRef.current &&
        modeGrant.isCurrent()
      ) {
        const activeSlot = activeMusicPlayerSlot.current;
        const activePlayer = musicPlayerForSlot(activeSlot);
        activePlayer.volume = MUSIC_VOLUME;
        setMusicLockScreen(activeSlot, musicTrackIndex.current);
        activePlayer.play();
      }
    })().catch((error) => {
      console.warn('Failed to start background music', error);
      if (active && !transientAudioBusyRef.current && useSession.getState().musicOn) {
        useSession.getState().toggleMusic();
      }
      if (active && !transientAudioBusyRef.current) void releaseMusicSession();
    });
    return () => {
      active = false;
    };
  }, [
    applyMusicAudioMode,
    musicPlayerForSlot,
    pauseMusicPlayers,
    releaseMusicSession,
    s.musicOn,
    setMusicLockScreen,
    transientAudioBusy,
  ]);

  const startMusicCrossfade = useCallback((durationMs = MUSIC_CROSSFADE_MS) => {
    if (
      musicCrossfadeRunning.current ||
      musicTracks.length === 0 ||
      transientAudioBusyRef.current ||
      !useSession.getState().musicOn
    ) {
      return;
    }

    const fromSlot = activeMusicPlayerSlot.current;
    const toSlot: MusicPlayerSlot = fromSlot === 0 ? 1 : 0;
    const fromPlayer = musicPlayerForSlot(fromSlot);
    const toPlayer = musicPlayerForSlot(toSlot);
    const nextTrackIndex = (musicTrackIndex.current + 1) % musicTracks.length;
    const nextTrack = musicTracks[nextTrackIndex];

    if (loadedMusicTrackIndexes.current[toSlot] !== nextTrackIndex) {
      toPlayer.replace(nextTrack.source);
      loadedMusicTrackIndexes.current[toSlot] = nextTrackIndex;
    }

    musicCrossfadeRunning.current = true;
    toPlayer.volume = 0;
    fromPlayer.clearLockScreenControls();
    setMusicLockScreen(toSlot, nextTrackIndex);
    toPlayer.play();

    const startedAt = Date.now();
    musicCrossfadeTimer.current = setInterval(() => {
      if (
        transientAudioBusyRef.current ||
        !useSession.getState().musicOn
      ) {
        cancelMusicCrossfade();
        return;
      }

      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      // Equal-power curve avoids a perceived volume dip in the middle.
      fromPlayer.volume = MUSIC_VOLUME * Math.cos(progress * Math.PI / 2);
      toPlayer.volume = MUSIC_VOLUME * Math.sin(progress * Math.PI / 2);
      if (progress < 1) return;

      if (musicCrossfadeTimer.current) clearInterval(musicCrossfadeTimer.current);
      musicCrossfadeTimer.current = null;
      musicCrossfadeRunning.current = false;
      fromPlayer.pause();
      fromPlayer.volume = 0;
      toPlayer.volume = MUSIC_VOLUME;
      activeMusicPlayerSlot.current = toSlot;
      musicTrackIndex.current = nextTrackIndex;

      const preloadTrackIndex = (nextTrackIndex + 1) % musicTracks.length;
      fromPlayer.replace(musicTracks[preloadTrackIndex].source);
      loadedMusicTrackIndexes.current[fromSlot] = preloadTrackIndex;
    }, MUSIC_CROSSFADE_TICK_MS);
  }, [cancelMusicCrossfade, musicPlayerForSlot, musicTracks, setMusicLockScreen]);

  useEffect(() => {
    const handleMusicStatus = (slot: MusicPlayerSlot, status: AudioStatus) => {
      if (musicPlayingBySlot.current[slot] !== status.playing) {
        musicPlayingBySlot.current[slot] = status.playing;
        const anyPlayerIsPlaying = musicPlayingBySlot.current.some(Boolean);
        setMusicPlayersPlaying((current) => (
          current === anyPlayerIsPlaying ? current : anyPlayerIsPlaying
        ));
      }

      if (
        slot !== activeMusicPlayerSlot.current ||
        musicCrossfadeRunning.current ||
        musicTracks.length === 0
      ) {
        return;
      }
      if (status.didJustFinish) {
        // Редкий запасной путь, если статус перед концом не успел прийти.
        startMusicCrossfade(250);
        return;
      }
      if (
        status.playing &&
        status.duration > 0 &&
        status.duration - status.currentTime <= MUSIC_CROSSFADE_LEAD_SECONDS
      ) {
        startMusicCrossfade();
      }
    };

    const playerASubscription = musicPlayerA.addListener(
      'playbackStatusUpdate',
      (status) => handleMusicStatus(0, status),
    );
    const playerBSubscription = musicPlayerB.addListener(
      'playbackStatusUpdate',
      (status) => handleMusicStatus(1, status),
    );
    return () => {
      playerASubscription.remove();
      playerBSubscription.remove();
    };
  }, [musicPlayerA, musicPlayerB, musicTracks.length, startMusicCrossfade]);

  useEffect(
    () => () => {
      if (musicCrossfadeTimer.current) clearInterval(musicCrossfadeTimer.current);
      musicCrossfadeTimer.current = null;
      musicCrossfadeRunning.current = false;
      void releaseMusicSession();
    },
    [releaseMusicSession],
  );

  const handleTransientAudioChange = useCallback(
    (busy: boolean) => {
      // Playback completions can arrive after recording started. They do not
      // own the recording lease and must not clear its synchronous busy guard.
      if (!busy && audioModeCoordinator.hasRecordingLease()) return;
      // Эта остановка синхронна: запись не должна ждать React-effect.
      transientAudioBusyRef.current = busy;
      if (busy) {
        pauseMusicPlayers();
      }
      setTransientAudioBusy(busy);
    },
    [pauseMusicPlayers],
  );
  const currentScripture = s.scrList[s.scrIndex];
  const scriptureAudio = useScriptureAudio({
    scripture: currentScripture,
    voice: s.scriptureVoice,
    enabled: s.dockMode === 'scripture' && appState === 'active',
    onAudioBusyChange: handleTransientAudioChange,
  });
  const activityOpen = readerOpen || answerOpen || scriptureAudio.phase !== 'idle';
  const handleAnswerAudioChange = useCallback(
    (busy: boolean) => {
      if (busy) scriptureAudio.stop();
      handleTransientAudioChange(busy);
    },
    [handleTransientAudioChange, scriptureAudio.stop],
  );

  // секундный тик
  useEffect(() => {
    const id = setInterval(() => useSession.getState().tick(), 1000);
    return () => clearInterval(id);
  }, []);

  // Android «назад» не должен срывать молитву — глотаем жест
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const goToReflect = async () => {
    if (finished.current) return;
    finished.current = true;
    // открытый черновик ответа дописывается, а не выбрасывается
    if (flushAnswerRef.current) await flushAnswerRef.current();
    // useAudioPlayer освобождает native shared object при unmount, поэтому
    // останавливаем озвучку Писания синхронно до router.replace.
    scriptureAudio.stop();
    // Останавливаем плееры до router.replace: useAudioPlayer сам удалит
    // native shared objects при unmount, и обращаться к ним из cleanup уже нельзя.
    pauseMusicPlayers();
    await stopPrayerSystemTimer().catch((error) => {
      console.warn('Failed to stop prayer system timer', error);
    });
    await releaseMusicSession();
    if (useSession.getState().musicOn) useSession.getState().toggleMusic();
    void s.finish();
    router.replace('/reflect');
  };

  const goToReflectRef = useRef(goToReflect);
  goToReflectRef.current = goToReflect;
  useEffect(() => scheduleSessionCompletion({
    timeExpired,
    appActive: appState === 'active',
    activityOpen,
  }, () => { void goToReflectRef.current(); }), [timeExpired, appState, activityOpen]);

  // Читалку, ответ и озвучку не обрываем. После фона показываем
  // ещё не увиденную плашку, а после возврата к таймеру завершаем сессию.
  useEffect(() => {
    if (!timeExpired) {
      expiryNotified.current = false;
      setShowExpiryNotice(false);
      return;
    }
    if (appState !== 'active' || expiryNotified.current) return;
    expiryNotified.current = true;
    setShowExpiryNotice(activityOpen);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [timeExpired, appState, activityOpen]);

  useEffect(() => {
    if (!showExpiryNotice) return;
    const timeout = setTimeout(() => setShowExpiryNotice(false), 6_000);
    return () => clearTimeout(timeout);
  }, [showExpiryNotice]);

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

  const finishEarly = () => { void goToReflect(); };

  const timerLabel = s.remaining === null ? fmtTime(s.elapsed) : fmtTime(s.remaining);
  const timerSub =
    timeExpired
      ? t(activityOpen ? 'screens.session.continuePrayer' : 'screens.session.timeCompleted')
      : s.remaining === null
        ? t('screens.session.elapsed')
        : t('screens.session.remaining');
  // у конца (меньше 5 мин) — шаг 1 минута, как в прототипе
  const adjStep = s.remaining !== null && s.remaining < 300 ? 1 : 5;
  // Звучащую музыку показывает сама кнопка: отдельный бейдж занимал строку
  // над таймером и прилипал к кольцу.
  const musicPlaying = s.musicOn && !transientAudioBusy && musicPlayersPlaying;

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
            <IconButton
              onPress={finishEarly}
              accessibilityLabel={t('screens.session.finish')}
              testID="session-finish-button"
            >
              <Close />
            </IconButton>
            <Kicker numberOfLines={1} style={styles.topTitle}>
              {t('screens.session.title')}
            </Kicker>
            <View style={styles.musicBtnWrap}>
              {musicPlaying && <MusicPulse size={sc(34)} />}
              <IconButton
                onPress={s.toggleMusic}
                bg={s.musicOn ? 'rgba(230,162,60,.16)' : colors.white05}
                border={s.musicOn ? 'rgba(230,162,60,.4)' : undefined}
                accessibilityLabel={s.musicOn ? t('screens.session.musicOff') : t('screens.session.musicOn')}
                accessibilityState={{ selected: s.musicOn }}
              >
                <Music color={s.musicOn ? colors.amberBright : 'rgba(255,255,255,.5)'} />
              </IconButton>
            </View>
          </View>

          <View style={[styles.timerWrap, { width: ringSize, height: ringSize }]}>
            <TimerHalo size={ringSize} />
            <ProgressRing size={ringSize} strokeWidth={3} progress={ringProgress} />
            <Pressable
              accessibilityLabel={t('screens.session.adjust')}
              accessibilityRole="button"
              accessibilityState={{ expanded: adjustOpen }}
              disabled={s.remaining === null}
              onPress={() => {
                Haptics.selectionAsync();
                setAdjustOpen((v) => !v);
              }}
              style={StyleSheet.absoluteFill}
              testID="session-timer-button"
            />
            <View pointerEvents="none" style={styles.timerContent}>
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
              <Kicker style={{
                fontSize: Math.min(sc(11), ringSize * 0.062),
                textAlign: 'center',
              }}>
                {timerSub}
              </Kicker>
            </View>
            {adjustOpen && s.remaining !== null && (
              <>
                <AdjustBtn
                  ringSize={ringSize}
                  side="left"
                  label={`−${adjStep}`}
                  accent
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
              {t('screens.session.goal')}
            </Kicker>
            <Text style={styles.goalText} numberOfLines={3}>
              {s.topic.trim() || t('screens.session.free')}
            </Text>
          </View>

          <View style={styles.dockWrap}>
            <CompanionDock
              onOpenAnswer={() => openAnswerRef.current?.()}
              onOpenReader={() => {
                setReaderOpen(true);
                readerRef.current?.snapToIndex(0);
              }}
              scriptureAudio={scriptureAudio}
            />
          </View>
        </View>
      </Animated.View>

      <AnswerSheet
        sheetRef={answerRef}
        openRef={openAnswerRef}
        flushRef={flushAnswerRef}
        onOpenChange={setAnswerOpen}
        onAudioBusyChange={handleAnswerAudioChange}
      />
      <ScriptureReader
        sheetRef={readerRef}
        scriptureAudio={scriptureAudio}
        onOpenChange={setReaderOpen}
      />
      {showExpiryNotice && activityOpen && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOut.duration(250)}
          pointerEvents="none"
          style={[styles.expiryNotice, { top: insets.top + sc(8) }]}
          testID="session-expiry-notice"
        >
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.expiryNoticeText}>
            {t('screens.session.expiryNotice')}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

// Пока музыка звучит, кнопка тихо «дышит» тёплым ореолом — это и есть
// индикатор вместо отдельного бейджа под шапкой.
function MusicPulse({ size }: { size: number }) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.36 }],
    opacity: 0.4 - pulse.value * 0.3,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      // Ореол — единственный признак звучащей музыки, поэтому у него есть
      // и голосовой эквивалент вместо снятого бейджа.
      accessible
      accessibilityLabel={t('screens.session.musicPlaying')}
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
  expiryNotice: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: sc(390),
    marginHorizontal: sc(16),
    paddingHorizontal: sc(18),
    paddingVertical: sc(12),
    borderRadius: sc(14),
    backgroundColor: '#21190f',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.3)',
    zIndex: 30,
    elevation: 30,
  },
  expiryNoticeText: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    lineHeight: sc(19),
    color: colors.creamBright,
    textAlign: 'center',
  },
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
    gap: 0,
  },
  timerText: {
    fontFamily: fonts.serif,
    color: colors.creamBright,
  },
  // Подсказка, что по таймеру можно нажать, раньше рисовалась пунктирным
  // подчёркиванием — от него отказались по фидбеку владельца. paddingBottom
  // оставлен как есть, чтобы высота блока не менялась.
  timerTextAdjustable: {
    paddingBottom: 4,
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
