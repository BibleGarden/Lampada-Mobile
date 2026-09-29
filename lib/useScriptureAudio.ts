import { useCallback, useEffect, useRef, useState } from 'react';
import {
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { ScriptureDisplay } from './scripture';
import { fetchScriptureAudioClip, type ScriptureAudioClip } from './scriptureAudioClient';
import {
  audioModeCoordinator,
  TRANSIENT_AUDIO_PLAYER_OPTIONS,
  type AudioSessionLease,
} from './audioModeCoordinator';
import { createScriptureAudioOperation } from './scriptureAudioOperation';

export type ScriptureAudioPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

const SCRIPTURE_PLAYBACK_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix' as const,
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
  voice: number;
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
    const lease = audioModeCoordinator.acquireSession(
      () => setIsAudioActiveAsync(false),
    );
    sessionLeaseRef.current = lease;
    return lease;
  }, []);
  const playbackOperationRef = useRef<ReturnType<typeof createScriptureAudioOperation> | null>(null);
  if (!playbackOperationRef.current) {
    playbackOperationRef.current = createScriptureAudioOperation();
  }
  const playbackOperation = playbackOperationRef.current;
  const scriptureKey = scripture
    ? `${scripture.canonicalId}:${scripture.receivedAt}:${voice}`
    : null;
  playbackOperation.setContext(enabled && !scripture?.offline ? scriptureKey : null);

  const stop = useCallback((nextPhase: ScriptureAudioPhase = 'idle') => {
    playbackOperation.invalidate();
    requestRef.current?.abort();
    requestRef.current = null;
    player.pause();
    releaseSession();
    clipRef.current = null;
    scriptureKeyRef.current = null;
    setPhase(nextPhase);
    onAudioBusyChange(false);
  }, [onAudioBusyChange, playbackOperation, player, releaseSession]);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    if (scriptureKeyRef.current && scriptureKeyRef.current !== scriptureKey) stop();
  }, [scriptureKey, stop]);

  useEffect(() => {
    const clip = clipRef.current;
    if (phase !== 'playing' || !clip) return;
    if (status.playbackState === 'error') {
      stop('error');
      return;
    }
    if (status.currentTime + 0.03 < clip.endSeconds) return;
    player.pause();
    releaseSession();
    setPhase('idle');
    onAudioBusyChange(false);
    void player.seekTo(clip.startSeconds, 0, 0).catch(() => setPhase('error'));
  }, [onAudioBusyChange, phase, player, releaseSession, status.currentTime, status.playbackState, stop]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      releaseSession();
    },
    [releaseSession],
  );

  const toggle = useCallback(() => {
    if (!scripture || scripture.offline || !enabled) return;
    if (phase === 'loading') return;
    if (phase === 'playing') {
      player.pause();
      releaseSession();
      setPhase('paused');
      onAudioBusyChange(false);
      return;
    }
    if ((phase === 'paused' || phase === 'idle') && clipRef.current) {
      const continuation = playbackOperation.begin();
      if (!continuation) return;
      const lease = acquireSession();
      setPhase('loading');
      onAudioBusyChange(true);
      void audioModeCoordinator
        .requestPlayback(setAudioModeAsync, SCRIPTURE_PLAYBACK_MODE)
        .then((grant) => {
          if (!continuation.isCurrent()) {
            releaseSession(lease);
            return;
          }
          if (!grant?.isCurrent()) {
            setPhase(phase);
            onAudioBusyChange(false);
            releaseSession(lease);
            return;
          }
          player.play();
          setPhase('playing');
        })
        .catch((error) => {
          if (!continuation.isCurrent()) {
            releaseSession(lease);
            return;
          }
          console.warn('Failed to restore Scripture audio mode', error);
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
        player.play();
        setPhase('playing');
      } catch (error) {
        if (controller.signal.aborted) {
          releaseSession(lease);
          return;
        }
        console.warn(
          'Failed to play Scripture passage',
          error instanceof Error ? error.message : 'unknown error',
        );
        setPhase('error');
        onAudioBusyChange(false);
        releaseSession(lease);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    })();
  }, [acquireSession, enabled, onAudioBusyChange, phase, playbackOperation, player, releaseSession, scripture, scriptureKey, voice]);

  let activeVerseNumber: number | null = null;
  const clip = clipRef.current;
  const currentScriptureKey = scriptureKey;
  if (
    (phase === 'playing' || phase === 'paused') &&
    clip?.verses.length &&
    scriptureKeyRef.current === currentScriptureKey
  ) {
    // Между стихами не оставляем пустой кадр: отметка переходит на следующий
    // стих один раз, в середине паузы между end предыдущего и begin следующего.
    activeVerseNumber = clip.verses[0].number;
    for (let index = 1; index < clip.verses.length; index++) {
      const previous = clip.verses[index - 1];
      const current = clip.verses[index];
      const switchTime = (previous.endSeconds + current.startSeconds) / 2;
      if (status.currentTime + 0.03 < switchTime) break;
      activeVerseNumber = current.number;
    }
  }

  return { phase, activeVerseNumber, stop, toggle };
}
