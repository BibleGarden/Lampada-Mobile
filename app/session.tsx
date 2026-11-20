import { useI18n, pluralCategory } from '../lib/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Circle, Group, RadialGradient, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import {
  setAudioModeAsync,
  type AudioStatus,
  useAudioPlayer,
} from 'expo-audio';
import BottomSheet from '@gorhom/bottom-sheet';
import ScreenBg from '../components/ScreenBg';
import ProgressRing from '../components/ProgressRing';
import CompanionDock from '../components/CompanionDock';
import AnswerSheet from '../components/AnswerSheet';
import ScriptureReader from '../components/ScriptureReader';
import { CardIn, IconButton, Kicker } from '../components/ui';
import { Close, Music } from '../components/icons';
import { fmtTime, useSession } from '../lib/store';
import { getPrayerTracks } from '../lib/music';
import { bottomActionPadding, colors, column, fonts, isTablet, sc, screenGutter, useStyles } from '../lib/theme';
import { useScriptureAudio } from '../lib/useScriptureAudio';
import { stopPrayerSystemTimer } from '../lib/prayerSystemTimer';
import { screenReaderHiddenProps } from '../lib/a11y';
import { useVisibleScreen } from '../lib/useVisibleScreen';
import { backgroundDeadlineDelay } from '../lib/visibleActivity';
import { hasSessionActivity, scheduleSessionCompletion } from '../lib/sessionCompletion';
import {
  IDLE_AUDIO_SOURCES,
  isAudioBusy,
  setAudioSourceBusy,
  type AudioBusyBySource,
  type AudioBusySource,
} from '../lib/audioBusy';
import {
  hastenMusicFadeOut,
  musicFadeOutVolume,
  startMusicFadeOut,
  type MusicFadeOut,
} from '../lib/musicFade';
import { type AudioSessionLease } from '../lib/audioModeCoordinator';
import { audioModeCoordinator } from '../lib/audioSession';

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
// Nothing in the background waits for the fade-out to finish. The transition
// to the summary waits for it until router.replace (players live while the
// screen is mounted), so that one is shorter.
const MUSIC_BACKGROUND_FADE_OUT_MS = 3000;
const MUSIC_FINISH_FADE_OUT_MS = 800;
const SESSION_HEADER_MARGIN_CORRECTION = 9;
const SESSION_GOAL_MARGIN_CORRECTION = 3;
const SESSION_DEFAULT_GAP = 22;
const SESSION_ROOMY_GAP = 14;
const SESSION_ROOMY_CARD_MIN_HEIGHT = 230;
type MusicPlayerSlot = 0 | 1;

// The ring is bounded not only by width, like the other prototype tokens,
// but also by window height. Otherwise on a wide, short iPhone it eats all
// the space between the header and the companion card.
// On tablets the height share is larger: the ring has room to grow there,
// and at phone size it would be lost in the middle of the screen.
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
  const { t, language } = useI18n();
  const styles = useStyles(stylesFactory);
  const visible = useVisibleScreen();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ringSize = ringSizeFor(height);
  const [sessionLayout, setSessionLayout] = useState({ frame: 0, header: 0, goal: 0 });
  const measureSessionPart = (part: keyof typeof sessionLayout, value: number) => {
    setSessionLayout((current) => Math.abs(current[part] - value) < 1
      ? current : { ...current, [part]: value });
  };
  // Space is measured with the default gaps, regardless of the chosen
  // density: otherwise shrinking the gap would flip the rule back and forth
  // on its own. onLayout heights exclude the header and goal negative margins.
  const reservedCardHeight = insets.top + sc(2) + bottomActionPadding(insets.bottom)
    + ringSize + sc(SESSION_DEFAULT_GAP) * 3
    - sc(SESSION_HEADER_MARGIN_CORRECTION) - sc(SESSION_GOAL_MARGIN_CORRECTION);
  const freeCardHeight = sessionLayout.frame - reservedCardHeight
    - sessionLayout.header - sessionLayout.goal;
  const densityMeasured = sessionLayout.frame > 0 && sessionLayout.header > 0
    && sessionLayout.goal > 0;
  const roomyCard = densityMeasured && freeCardHeight >= sc(SESSION_ROOMY_CARD_MIN_HEIGHT);
  // Even without header and goal, free space cannot exceed this bound.
  // On an obviously tight window the card is shown right away; otherwise the
  // first measurement picks the density before the card appears within the
  // screen-wide FadeIn.
  const cardReady = densityMeasured
    || height - reservedCardHeight < sc(SESSION_ROOMY_CARD_MIN_HEIGHT);
  const s = useSession();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [showExpiryNotice, setShowExpiryNotice] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [musicPlayersPlaying, setMusicPlayersPlaying] = useState(false);
  const answerRef = useRef<BottomSheet>(null);
  const openAnswerRef = useRef<(() => void) | null>(null);
  const readerRef = useRef<BottomSheet>(null);
  const flushAnswerRef = useRef<(() => Promise<void>) | null>(null);
  const ringProgress = useSharedValue(0);
  const timeExpired = s.remaining === 0;
  const expiryNotified = useRef(false);
  const finished = useRef(false);
  const musicLeaseRef = useRef<AudioSessionLease | null>(null);
  // Scripture audio and the answer sheet each keep their own busy flag. The
  // ref exists because React-effect cleanup lags behind the press handler:
  // a music activation that is already starting must see the recording or
  // audio playback immediately.
  const audioBusySourcesRef = useRef<AudioBusyBySource>(IDLE_AUDIO_SOURCES);
  const [musicTracks] = useState(getPrayerTracks);
  const musicTrackIndex = useRef(0);
  const activeMusicPlayerSlot = useRef<MusicPlayerSlot>(0);
  const musicCrossfadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicCrossfadeRunning = useRef(false);
  const musicFadeOut = useRef<{
    fade: MusicFadeOut;
    finish: (completed: boolean) => void;
    stopped: Promise<void>;
  } | null>(null);
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

  const reportReleaseError = useCallback((error: unknown) => {
    console.error('Failed to release audio session', error);
  }, []);

  const releaseMusicLease = useCallback(() => {
    const lease = musicLeaseRef.current;
    musicLeaseRef.current = null;
    return lease?.release().catch(reportReleaseError) ?? Promise.resolve();
  }, [reportReleaseError]);

  useEffect(() => {
    // Background music must stay noticeably quieter than speech and system sounds.
    musicPlayerA.volume = MUSIC_VOLUME;
    musicPlayerB.volume = 0;
    musicPlayerB.pause();
  }, [musicPlayerA, musicPlayerB]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      // From the app switcher iOS may terminate the app without ever sending
      // 'background', so elapsed time is checkpointed already on 'inactive'.
      if (nextState === 'active') useSession.getState().tick();
      else useSession.getState().checkpointElapsed();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let active = true;
    const shouldPlay = s.musicOn && !audioBusy;
    if (!shouldPlay) {
      pauseMusicPlayers();
      return () => {
        active = false;
      };
    }
    const lease = audioModeCoordinator.acquireSession();
    musicLeaseRef.current = lease;
    void (async () => {
      const modeGrant = await audioModeCoordinator.requestPlayback(
        setAudioModeAsync,
        MUSIC_PLAYBACK_MODE,
      );
      if (!modeGrant?.isCurrent()) return;
      if (
        active &&
        !isAudioBusy(audioBusySourcesRef.current) &&
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
      if (active && !isAudioBusy(audioBusySourcesRef.current) && useSession.getState().musicOn) {
        useSession.getState().toggleMusic();
      }
      if (active && !isAudioBusy(audioBusySourcesRef.current)) void releaseMusicLease();
    });
    return () => {
      active = false;
      void lease.release().catch(reportReleaseError);
      if (musicLeaseRef.current === lease) musicLeaseRef.current = null;
    };
  }, [
    musicPlayerForSlot,
    pauseMusicPlayers,
    reportReleaseError,
    releaseMusicLease,
    s.musicOn,
    setMusicLockScreen,
    audioBusy,
  ]);

  const startMusicCrossfade = useCallback((durationMs = MUSIC_CROSSFADE_MS) => {
    if (
      musicCrossfadeRunning.current ||
      musicFadeOut.current ||
      musicTracks.length === 0 ||
      isAudioBusy(audioBusySourcesRef.current) ||
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
        isAudioBusy(audioBusySourcesRef.current) ||
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
        musicFadeOut.current ||
        musicTracks.length === 0
      ) {
        return;
      }
      if (status.didJustFinish) {
        // Rare fallback for when the status update before the end did not arrive in time.
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
      // The fade-out does not outlive the screen: its players are released with it.
      musicFadeOut.current?.finish(false);
      if (musicCrossfadeTimer.current) clearInterval(musicCrossfadeTimer.current);
      musicCrossfadeTimer.current = null;
      musicCrossfadeRunning.current = false;
      void releaseMusicLease();
    },
    [releaseMusicLease],
  );

  const setSourceAudioBusy = useCallback(
    (source: AudioBusySource, busy: boolean) => {
      audioBusySourcesRef.current = setAudioSourceBusy(audioBusySourcesRef.current, source, busy);
      // This stop is synchronous: the recording must not wait for a React effect.
      if (busy) pauseMusicPlayers();
      setAudioBusy(isAudioBusy(audioBusySourcesRef.current));
    },
    [pauseMusicPlayers],
  );
  const handleScriptureAudioChange = useCallback(
    (busy: boolean) => setSourceAudioBusy('scripture', busy),
    [setSourceAudioBusy],
  );
  const currentScripture = s.scrList[s.scrIndex];
  const scriptureAudio = useScriptureAudio({
    scripture: currentScripture,
    voice: s.scriptureSelection?.voice ?? null,
    enabled: s.dockMode === 'scripture',
    onAudioBusyChange: handleScriptureAudioChange,
  });
  const activityOpen = hasSessionActivity({
    readerOpen,
    answerOpen,
    reportOpen,
    scriptureAudioPhase: scriptureAudio.phase,
  });
  const handleAnswerAudioChange = useCallback(
    (busy: boolean) => {
      if (busy) scriptureAudio.stop();
      setSourceAudioBusy('answer', busy);
    },
    [scriptureAudio.stop, setSourceAudioBusy],
  );

  // The per-second tick is only needed by the visible UI. A hidden session
  // wakes once at the deadline to finish the time and fade out the music.
  useEffect(() => {
    if (visible) {
      useSession.getState().tick();
      const id = setInterval(() => useSession.getState().tick(), 1000);
      return () => clearInterval(id);
    }
    const delay = backgroundDeadlineDelay(Date.now(), s.endsAtMs, timeExpired);
    if (delay === null) return;
    const id = setTimeout(() => useSession.getState().tick(), delay);
    return () => clearTimeout(id);
  }, [visible, s.endsAtMs, timeExpired]);

  // Android "back" must not break the prayer — swallow the gesture
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Music plays only during prayer and fades out at the end. Players are
  // paused after the fade-out, before the audio session is released. A repeat
  // call does not start a second fade-out; it can only hasten the current one.
  const stopPrayerMusic = useCallback((fadeOutMs: number): Promise<void> => {
    const running = musicFadeOut.current;
    if (running) {
      running.fade = hastenMusicFadeOut(running.fade, Date.now(), fadeOutMs);
      return running.stopped;
    }
    const stop = async () => {
      pauseMusicPlayers();
      if (useSession.getState().musicOn) useSession.getState().toggleMusic();
      await releaseMusicLease();
    };
    if (!useSession.getState().musicOn || isAudioBusy(audioBusySourcesRef.current)) return stop();

    cancelMusicCrossfade();
    const player = musicPlayerForSlot(activeMusicPlayerSlot.current);
    let settle: (completed: boolean) => void = () => {};
    const faded = new Promise<boolean>((resolve) => { settle = resolve; });
    const timer = setInterval(() => {
      const current = musicFadeOut.current;
      if (!current) return;
      const volume = musicFadeOutVolume(current.fade, Date.now());
      if (volume > 0 && !isAudioBusy(audioBusySourcesRef.current)) {
        player.volume = volume;
        return;
      }
      current.finish(true);
    }, MUSIC_CROSSFADE_TICK_MS);
    const finish = (completed: boolean) => {
      clearInterval(timer);
      settle(completed);
    };
    // After unmount the players are already released: a cancelled fade-out must not touch them.
    const stopped = faded
      .then((completed) => (completed ? stop() : undefined))
      .finally(() => {
        musicFadeOut.current = null;
      });
    musicFadeOut.current = {
      fade: startMusicFadeOut(player.volume, Date.now(), fadeOutMs),
      finish,
      stopped,
    };
    return stopped;
  }, [cancelMusicCrossfade, musicPlayerForSlot, pauseMusicPlayers, releaseMusicLease]);

  // On a hidden screen the transition to the summary waits for the user to
  // return, while the music ends with the prayer time even under the PIN
  // overlay.
  useEffect(() => {
    if (!timeExpired || visible) return;
    void stopPrayerMusic(MUSIC_BACKGROUND_FADE_OUT_MS);
  }, [timeExpired, visible, stopPrayerMusic]);

  // Extending the expired timer while the deadline fade-out is still running
  // cancels it: the prayer continues and the music returns to normal volume.
  // The transition-to-summary fade-out (finished) is not cancelled. If the
  // music has already stopped and been switched off, extending does not turn
  // it back on — that is the user's decision, the music button is right there.
  useEffect(() => {
    const running = musicFadeOut.current;
    if (timeExpired || finished.current || !running) return;
    running.finish(false);
    if (useSession.getState().musicOn && !isAudioBusy(audioBusySourcesRef.current)) {
      musicPlayerForSlot(activeMusicPlayerSlot.current).volume = MUSIC_VOLUME;
    }
  }, [timeExpired, musicPlayerForSlot]);

  const goToReflect = async () => {
    if (finished.current) return;
    finished.current = true;
    // the open answer draft is flushed, not discarded
    if (flushAnswerRef.current) await flushAnswerRef.current();
    // useAudioPlayer releases its native shared object on unmount, so stop
    // the scripture audio synchronously before router.replace.
    scriptureAudio.stop();
    // Stop the players before router.replace: useAudioPlayer will dispose
    // the native shared objects on unmount, and cleanup must not touch them then.
    await stopPrayerMusic(MUSIC_FINISH_FADE_OUT_MS);
    await stopPrayerSystemTimer().catch((error) => {
      console.warn('Failed to stop prayer system timer', error);
    });
    void s.finish();
    router.replace('/reflect');
  };

  const goToReflectRef = useRef(goToReflect);
  goToReflectRef.current = goToReflect;
  useEffect(() => scheduleSessionCompletion({
    timeExpired,
    screenVisible: visible,
    activityOpen,
  }, () => { void goToReflectRef.current(); }), [timeExpired, visible, activityOpen]);

  // The reader, the answer sheet and the audio are not cut off. After the
  // background we show the banner that has not been seen yet, and once back
  // at the timer the session completes.
  useEffect(() => {
    if (!timeExpired) {
      expiryNotified.current = false;
      setShowExpiryNotice(false);
      return;
    }
    if (!visible || expiryNotified.current) return;
    expiryNotified.current = true;
    setShowExpiryNotice(activityOpen);
    // When nothing is open or playing, the session goes straight to the
    // summary screen; otherwise the banner is not announced by itself on
    // any platform.
    if (activityOpen) AccessibilityInfo.announceForAccessibility(t('screens.session.expiryNotice'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [timeExpired, visible, activityOpen]);

  useEffect(() => {
    if (!showExpiryNotice) return;
    const timeout = setTimeout(() => setShowExpiryNotice(false), 6_000);
    return () => clearTimeout(timeout);
  }, [showExpiryNotice]);

  // ring: fraction of elapsed time (or the minute cycle in ∞ mode)
  useEffect(() => {
    if (!visible) {
      cancelAnimation(ringProgress);
      return;
    }
    if (s.remaining === null) {
      const inMinute = s.elapsed % 60;
      if (inMinute === 0) {
        ringProgress.value = 0; // instant reset instead of animating backwards
      } else {
        ringProgress.value = withTiming(inMinute / 60, { duration: 1000 });
      }
    } else {
      const total = s.minutes * 60 || 1;
      ringProgress.value = withTiming(1 - s.remaining / Math.max(total, s.remaining), {
        duration: 1000,
      });
    }
  }, [s.remaining, s.elapsed, visible, ringProgress]);

  const finishEarly = () => { void goToReflect(); };

  const timerLabel = s.remaining === null ? fmtTime(s.elapsed) : fmtTime(s.remaining);
  const timerSub =
    timeExpired
      ? t(activityOpen ? 'screens.session.continuePrayer' : 'screens.session.timeCompleted')
      : s.remaining === null
        ? t('screens.session.elapsed')
        : t('screens.session.remaining');
  // near the end (under 5 min) the step is 1 minute, as in the prototype
  const adjStep = s.remaining !== null && s.remaining < 300 ? 1 : 5;
  const adjDuration = `${adjStep} ${t(`screens.minute.${pluralCategory(language, adjStep)}`)}`;
  // The button itself indicates playing music: a separate badge took up a
  // line above the timer and clung to the ring.
  const musicPlaying = s.musicOn && !audioBusy && musicPlayersPlaying;

  return (
    <View style={styles.root}>
      {visible && <KeepAwakeWhileVisible />}
      <ScreenBg />
      {/* while the answer sheet or the reader is open, the screen beneath is hidden */}
      <Animated.View
        entering={FadeIn.duration(500)}
        style={{ flex: 1 }}
        {...screenReaderHiddenProps(answerOpen || readerOpen)}
      >
        {/* Header, ring, goal and card form a single column with a shared
            gap; the card takes the remaining height. */}
        <View
          style={[
            styles.sessionContent,
            roomyCard && styles.sessionContentRoomy,
            {
              // The bottom padding keeps the card above system navigation;
              // on short windows it is taken out of the card's free height.
              paddingTop: insets.top + sc(2),
              paddingBottom: bottomActionPadding(insets.bottom),
            },
          ]}
          onLayout={({ nativeEvent }) => measureSessionPart('frame', nativeEvent.layout.height)}
        >
          <View style={styles.topBar} onLayout={({ nativeEvent }) => measureSessionPart('header', nativeEvent.layout.height)}>
            <IconButton
              onPress={finishEarly}
              accessibilityLabel={t('screens.session.finish')}
              testID="session-finish-button"
            >
              <Close />
            </IconButton>
            <Kicker numberOfLines={1} style={styles.topTitle} testID="session-title">
              {t('screens.session.title')}
            </Kicker>
            <View style={styles.musicBtnWrap}>
              {musicPlaying && <MusicPulse size={sc(34)} active={visible && !answerOpen && !readerOpen && !reportOpen} />}
              <IconButton
                onPress={s.toggleMusic}
                bg={s.musicOn ? 'rgba(230,162,60,.16)' : colors.white05}
                border={s.musicOn ? 'rgba(230,162,60,.4)' : undefined}
                accessibilityLabel={s.musicOn ? t('screens.session.musicOff') : t('screens.session.musicOn')}
                accessibilityState={{ selected: s.musicOn }}
                testID={s.musicOn ? 'session-music-on' : 'session-music-off'}
              >
                <Music color={s.musicOn ? colors.amberBright : 'rgba(255,255,255,.5)'} />
              </IconButton>
            </View>
          </View>

          <View style={[styles.timerWrap, { width: ringSize, height: ringSize }]}>
            <TimerHalo size={ringSize} active={visible && !answerOpen && !readerOpen && !reportOpen} />
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
            {/* VoiceOver reads the time and the caption below it as one phrase */}
            <View pointerEvents="none" accessible style={styles.timerContent}>
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
                  accessibilityLabel={t('screens.session.subtractTime', { duration: adjDuration })}
                  testID="session-time-subtract"
                  accent
                  onPress={() => s.adjustTimer(-adjStep)}
                />
                <AdjustBtn
                  ringSize={ringSize}
                  side="right"
                  label={`+${adjStep}`}
                  accessibilityLabel={t('screens.session.addTime', { duration: adjDuration })}
                  testID="session-time-add"
                  accent
                  onPress={() => s.adjustTimer(adjStep)}
                />
              </>
            )}
          </View>

          <View accessible style={styles.goalWrap} testID="session-goal"
            onLayout={({ nativeEvent }) => measureSessionPart('goal', nativeEvent.layout.height)}>
            <Kicker style={{ fontSize: sc(9), marginBottom: sc(5) }}>
              {t('screens.session.goal')}
            </Kicker>
            <Text style={styles.goalText} numberOfLines={3}>
              {s.topic.trim() || t('screens.session.free')}
            </Text>
          </View>

          <View
            style={[styles.dockWrap, !cardReady && styles.dockUnmeasured]}
            pointerEvents={cardReady ? 'auto' : 'none'}
            {...screenReaderHiddenProps(!cardReady)}
          >
            <CompanionDock
              onOpenAnswer={() => openAnswerRef.current?.()}
              onOpenReader={() => {
                setReaderOpen(true);
                readerRef.current?.snapToIndex(0);
              }}
              onOpenSettings={() => router.push('/settings')}
              onReportOpenChange={setReportOpen}
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
          exiting={FadeOut.duration(250)}
          pointerEvents="none"
          style={[styles.expiryNoticePosition, { top: insets.top + sc(8) }]}
          testID="session-expiry-notice"
        >
          <CardIn duration={200} style={styles.expiryNotice}>
            <Text style={styles.expiryNoticeText}>
              {t('screens.session.expiryNotice')}
            </Text>
          </CardIn>
        </Animated.View>
      )}
    </View>
  );
}

// While music is playing, the button quietly "breathes" with a warm halo —
// this is the indicator replacing a separate badge under the header.
function KeepAwakeWhileVisible() {
  useKeepAwake();
  return null;
}

function MusicPulse({ size, active }: { size: number; active: boolean }) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    // withRepeat swings between the start value and 1: without the reset the
    // pulse would shrink to the remainder of the cycle after a pause.
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, active]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.36 }],
    opacity: 0.4 - pulse.value * 0.3,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      // The halo is the only sign of playing music, so it also has a spoken
      // equivalent in place of the removed badge.
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

// warm breathing behind the ring — the 7s halo from the prototype.
// While the answer sheet is open the breathing is paused: Skia scene
// updates steal frames from the input field and typing becomes janky.
const HALO_CYCLE_MS = 7000;
const haloEasing = Easing.inOut(Easing.ease);

const TimerHalo = React.memo(function TimerHalo({
  size: ringSize,
  active,
}: {
  size: number;
  active: boolean;
}) {
  // Linear cycle phase 0..1: after a pause the breathing continues from the
  // same point and in the same direction instead of restarting a half-breath.
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    const linear = { easing: Easing.linear };
    phase.value = withSequence(
      withTiming(1, { ...linear, duration: (1 - phase.value) * HALO_CYCLE_MS }),
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { ...linear, duration: HALO_CYCLE_MS }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(phase);
  }, [active, phase]);
  // inhale on the first half of the phase, exhale on the second
  const t = useDerivedValue(() => haloEasing(1 - Math.abs(2 * phase.value - 1)));
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
});

function AdjustBtn({
  ringSize,
  side,
  label,
  accessibilityLabel,
  testID,
  accent,
  onPress,
}: {
  ringSize: number;
  side: 'left' | 'right';
  label: string;
  accessibilityLabel: string;
  testID: string;
  accent?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <CardIn
      duration={200}
      style={[
        styles.adjustBtnWrap,
        { top: ringSize / 2 - sc(22) },
        side === 'left' ? { left: -sc(68) } : { right: -sc(68) },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
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
    </CardIn>
  );
}

const stylesFactory = () => StyleSheet.create({
  expiryNoticePosition: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: sc(390),
    marginHorizontal: sc(16),
    zIndex: 30,
  },
  expiryNotice: {
    paddingHorizontal: screenGutter(),
    paddingVertical: sc(12),
    borderRadius: sc(14),
    backgroundColor: '#21190f',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.3)',
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
    // Optical correction to the shared gap: the spacing to the ring is read
    // from the "Prayer" title line, which sits centered in the row — half a
    // button height still remains below the buttons, so a geometrically equal
    // gap looks noticeably larger.
    marginBottom: -sc(SESSION_HEADER_MARGIN_CORRECTION),
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
    // One gap for every junction: header → ring → goal → card. On phones
    // there is no remainder — the card takes all of it. On tablets the card
    // is capped, and space-between distributes the remainder evenly across
    // the same junctions: extra height becomes air, not an empty card.
    justifyContent: 'space-between',
    gap: sc(SESSION_DEFAULT_GAP),
  },
  sessionContentRoomy: { gap: sc(SESSION_ROOMY_GAP) },
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
  // The hint that the timer is tappable used to be drawn as a dashed
  // underline — dropped per the owner's feedback. The paddingBottom is kept
  // as is so the block height does not change.
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
    // Same correction at the bottom: the goal line's bottom leading eats part of the gap.
    marginBottom: -sc(SESSION_GOAL_MARGIN_CORRECTION),
  },
  goalText: {
    fontFamily: fonts.serifItalic,
    fontSize: sc(14),
    lineHeight: sc(20),
    color: colors.body,
    textAlign: 'center',
  },
  dockUnmeasured: { opacity: 0 },
  dockWrap: {
    width: '100%',
    // The only stretching block: the card absorbs the remaining height,
    // so its footprint is the same in question and scripture modes.
    // On tablets growth is capped — otherwise two question lines would take
    // half the screen; whatever exceeds the cap, `space-between` hands out
    // to the gaps. The card must be able to shrink: in landscape there is
    // less height than even the minimal set needs.
    flexGrow: 1,
    flexShrink: 1,
    maxHeight: isTablet() ? sc(310) : undefined,
  },
});
