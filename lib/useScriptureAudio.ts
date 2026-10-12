import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { ScriptureDisplay } from './scripture';
import { fetchScriptureAudioClip, type ScriptureAudioClip } from './scriptureAudioClient';
import {
  TRANSIENT_AUDIO_PLAYER_OPTIONS,
  type AudioSessionLease,
} from './audioModeCoordinator';
import { audioModeCoordinator } from './audioSession';
import { createScriptureAudioOperation, narrationActiveVerse, narrationInterruptionTransition, narrationNativeState, type ScriptureAudioPhase } from './scriptureAudioOperation';
import { watchNativePlaybackStart } from './nativePlaybackStart';
import { errorKind, recordDiagnostic } from './db';

export type { ScriptureAudioPhase } from './scriptureAudioOperation';

const SCRIPTURE_PLAYBACK_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix' as const,
};

type NarrationFailure =
  | 'not_started'
  | 'buffering_timeout'
  | 'player_error'
  | 'play_failed'
  | 'mode_failed'
  | 'rewind_failed';

/** Лог и диагностика без текста ошибки: в нём может оказаться адрес с ключом. */
const reportNarrationFailure = (reason: NarrationFailure, details: Record<string, string> = {}) => {
  console.warn('Scripture narration failed', reason, details);
  recordDiagnostic('scripture_audio_failed', { reason, ...details });
};

export type ScriptureAudioControl = {
  phase: ScriptureAudioPhase;
  activeVerseNumber: number | null;
  stop: () => void;
  toggle: () => void;
};

export function useScriptureAudio({
  scripture,
  voice,
  enabled,
  onAudioBusyChange,
}: {
  scripture: ScriptureDisplay | undefined;
  // null, пока первый выбор Библии не подтверждён: тогда и отрывка нет.
  voice: number | null;
  enabled: boolean;
  onAudioBusyChange: (busy: boolean) => void;
}): ScriptureAudioControl {
  const player = useAudioPlayer(null, {
    ...TRANSIENT_AUDIO_PLAYER_OPTIONS,
    updateInterval: 200,
  });
  const status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<ScriptureAudioPhase>('idle');
  const clipRef = useRef<ScriptureAudioClip | null>(null);
  const scriptureKeyRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const sessionLeaseRef = useRef<AudioSessionLease | null>(null);
  const releaseSession = useCallback((ownedLease?: AudioSessionLease | null) => {
    const lease = sessionLeaseRef.current;
    if (ownedLease && lease !== ownedLease) return;
    sessionLeaseRef.current = null;
    if (lease) void lease.release().catch((error) => {
      console.error('Failed to release audio session', error);
    });
  }, []);
  const acquireSession = useCallback(() => {
    if (sessionLeaseRef.current) throw new Error('Scripture audio already owns a session lease');
    const lease = audioModeCoordinator.acquireSession();
    sessionLeaseRef.current = lease;
    return lease;
  }, []);
  const playbackOperationRef = useRef<ReturnType<typeof createScriptureAudioOperation> | null>(null);
  if (!playbackOperationRef.current) {
    playbackOperationRef.current = createScriptureAudioOperation();
  }
  const playbackOperation = playbackOperationRef.current;
  // Подтвердил ли нативный плеер последний play(). Android молча игнорирует
  // play() при выключенной аудиосессии, поэтому фаза следует за плеером.
  const nativeStartedRef = useRef(false);
  const cancelStartWatchRef = useRef<(() => void) | null>(null);
  const clearStartWatch = useCallback(() => {
    cancelStartWatchRef.current?.();
    cancelStartWatchRef.current = null;
  }, []);
  const scriptureKey = scripture && voice !== null
    ? `${scripture.canonicalId}:${scripture.receivedAt}:${voice}`
    : null;
  playbackOperation.setContext(enabled && !scripture?.offline ? scriptureKey : null);

  const stop = useCallback((nextPhase: ScriptureAudioPhase = 'idle') => {
    playbackOperation.invalidate();
    clearStartWatch();
    nativeStartedRef.current = false;
    requestRef.current?.abort();
    requestRef.current = null;
    player.pause();
    releaseSession();
    clipRef.current = null;
    scriptureKeyRef.current = null;
    setPhase(nextPhase);
    onAudioBusyChange(false);
  }, [clearStartWatch, onAudioBusyChange, playbackOperation, player, releaseSession]);

  const playNative = useCallback(() => {
    clearStartWatch();
    nativeStartedRef.current = false;
    player.play();
    cancelStartWatchRef.current = watchNativePlaybackStart({
      readStatus: () => player.currentStatus,
      hasStarted: () => nativeStartedRef.current,
      onFailed: (reason, live) => {
        cancelStartWatchRef.current = null;
        reportNarrationFailure(reason, { playbackState: live.playbackState ?? 'unknown' });
        stop('error');
      },
    });
  }, [clearStartWatch, player, stop]);

  const finishClip = useCallback((clip: ScriptureAudioClip) => {
    clearStartWatch();
    nativeStartedRef.current = false;
    player.pause();
    releaseSession();
    setPhase('idle');
    onAudioBusyChange(false);
    void player.seekTo(clip.startSeconds, 0, 0).catch((error) => {
      reportNarrationFailure('rewind_failed', { errorKind: errorKind(error) });
      setPhase('error');
    });
  }, [clearStartWatch, onAudioBusyChange, player, releaseSession]);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    if (scriptureKeyRef.current && scriptureKeyRef.current !== scriptureKey) stop();
  }, [scriptureKey, stop]);

  useEffect(() => {
    const clip = clipRef.current;
    if ((phase !== 'playing' && phase !== 'interrupted') || !clip) return;
    if (status.playbackState === 'error') {
      reportNarrationFailure('player_error');
      stop('error');
      return;
    }
    if (status.currentTime + 0.03 >= clip.endSeconds) {
      finishClip(clip);
      return;
    }
    // Событие статуса могло отстать от недавнего play(): решает живой статус.
    const live = player.currentStatus;
    if (narrationNativeState(live, nativeStartedRef.current) === 'stopped'
      && live.duration > 0 && live.currentTime + 0.5 >= live.duration) {
      // Последний стих главы может кончаться позже файла: плеер дошёл до конца сам.
      finishClip(clip);
      return;
    }
    const transition = narrationInterruptionTransition(phase, {
      type: 'status', status, liveStatus: live, started: nativeStartedRef.current,
    });
    if (status.playing) nativeStartedRef.current = true;
    if (!transition) return;
    if (transition.session === 'release') releaseSession();
    nativeStartedRef.current = transition.phase === 'playing';
    // Android возобновит плеер после возврата audio focus, только пока lease
    // держит сессию активной. Deadline при этом не ждёт системную паузу.
    clearStartWatch();
    setPhase(transition.phase);
    onAudioBusyChange(transition.audioBusy);
  }, [
    finishClip,
    clearStartWatch,
    onAudioBusyChange,
    phase,
    player,
    releaseSession,
    status,
    stop,
  ]);

  useEffect(
    () => () => {
      clearStartWatch();
      requestRef.current?.abort();
      releaseSession();
    },
    [clearStartWatch, releaseSession],
  );

  const toggle = useCallback(() => {
    if (!scripture || scripture.offline || !enabled || voice === null) return;
    if (phase === 'loading' || phase === 'unavailable') return;
    if (phase === 'playing') {
      clearStartWatch();
      player.pause();
      releaseSession();
      setPhase('paused');
      onAudioBusyChange(false);
      return;
    }
    if ((phase === 'paused' || phase === 'interrupted' || phase === 'idle') && clipRef.current) {
      const continuation = playbackOperation.begin();
      if (!continuation) return;
      const transition = narrationInterruptionTransition(phase, { type: 'resume_requested' })!;
      const lease = transition.session === 'retain' ? sessionLeaseRef.current : acquireSession();
      if (!lease) throw new Error('Interrupted narration has no audio session lease');
      setPhase(transition.phase);
      onAudioBusyChange(transition.audioBusy);
      void audioModeCoordinator
        .requestPlayback(setAudioModeAsync, SCRIPTURE_PLAYBACK_MODE)
        .then((grant) => {
          if (!continuation.isCurrent()) {
            releaseSession(lease);
            return;
          }
          if (!grant?.isCurrent()) {
            const denied = narrationInterruptionTransition(phase, { type: 'resume_denied' })!;
            setPhase(denied.phase);
            onAudioBusyChange(denied.audioBusy);
            if (denied.session === 'release') releaseSession(lease);
            return;
          }
          playNative();
          setPhase('playing');
        })
        .catch((error) => {
          if (!continuation.isCurrent()) {
            releaseSession(lease);
            return;
          }
          reportNarrationFailure('mode_failed', { errorKind: errorKind(error) });
          setPhase('error');
          onAudioBusyChange(false);
          releaseSession(lease);
        });
      return;
    }

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    scriptureKeyRef.current = scriptureKey;
    setPhase('loading');
    onAudioBusyChange(true);
    void (async () => {
      let lease: AudioSessionLease | null = null;
      try {
        const clip = await fetchScriptureAudioClip(scripture, voice, controller.signal);
        if (requestRef.current !== controller) return;
        lease = acquireSession();
        const modeGrant = await audioModeCoordinator.requestPlayback(
          setAudioModeAsync,
          SCRIPTURE_PLAYBACK_MODE,
        );
        if (requestRef.current !== controller) {
          releaseSession(lease);
          return;
        }
        if (!modeGrant?.isCurrent()) {
          setPhase('idle');
          onAudioBusyChange(false);
          releaseSession(lease);
          return;
        }
        player.replace(clip.url);
        await player.seekTo(clip.startSeconds, 0, 0);
        if (requestRef.current !== controller) {
          releaseSession(lease);
          return;
        }
        if (!modeGrant.isCurrent()) {
          setPhase('idle');
          onAudioBusyChange(false);
          releaseSession(lease);
          return;
        }
        clipRef.current = clip;
        scriptureKeyRef.current = scriptureKey;
        playNative();
        setPhase('playing');
      } catch (error) {
        if (controller.signal.aborted || requestRef.current !== controller) {
          releaseSession(lease);
          return;
        }
        const unavailable = error instanceof Error && error.message === 'audio_unavailable';
        const passage = scripture.selection.passage;
        if (unavailable) {
          recordDiagnostic('scripture_audio_unavailable', {
            translation: String(passage.translation),
            voice: String(voice),
            book: String(passage.book_number),
            chapter: String(passage.chapter_number),
          });
        } else {
          reportNarrationFailure('play_failed', {
            errorKind: errorKind(error),
            // Коды клиента (not_configured, invalid_response…) не содержат данных.
            ...(error instanceof Error && /^[a-z_]+$/.test(error.message) ? { code: error.message } : {}),
          });
        }
        setPhase(unavailable ? 'unavailable' : 'error');
        onAudioBusyChange(false);
        releaseSession(lease);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    })();
  }, [acquireSession, clearStartWatch, enabled, onAudioBusyChange, phase, playbackOperation, playNative, player, releaseSession, scripture, scriptureKey, voice]);

  const clip = clipRef.current;
  const activeVerseNumber = clip && scriptureKeyRef.current === scriptureKey
    ? narrationActiveVerse(phase, clip.verses, status.currentTime)
    : null;

  // Стабильный объект: читалка мемоизирована и получает его через props.
  return useMemo(() => ({ phase, activeVerseNumber, stop, toggle }), [phase, activeVerseNumber, stop, toggle]);
}
