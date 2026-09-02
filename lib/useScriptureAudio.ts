import { useCallback, useEffect, useRef, useState } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { ScriptureDisplay } from './scripture';
import { fetchScriptureAudioClip, type ScriptureAudioClip } from './scriptureAudioClient';
import {
  audioModeCoordinator,
  TRANSIENT_AUDIO_PLAYER_OPTIONS,
} from './audioModeCoordinator';
import { createScriptureAudioOperation } from './scriptureAudioOperation';

export type ScriptureAudioPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

const SCRIPTURE_PLAYBACK_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
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
    clipRef.current = null;
    scriptureKeyRef.current = null;
    setPhase(nextPhase);
    onAudioBusyChange(false);
  }, [onAudioBusyChange, playbackOperation, player]);

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
    setPhase('idle');
    onAudioBusyChange(false);
    void player.seekTo(clip.startSeconds, 0, 0).catch(() => setPhase('error'));
  }, [onAudioBusyChange, phase, player, status.currentTime, status.playbackState, stop]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  const toggle = useCallback(() => {
    if (!scripture || scripture.offline || !enabled) return;
    if (phase === 'loading') return;
    if (phase === 'playing') {
      player.pause();
      setPhase('paused');
      onAudioBusyChange(false);
      return;
    }
    if ((phase === 'paused' || phase === 'idle') && clipRef.current) {
      const continuation = playbackOperation.begin();
      if (!continuation) return;
      onAudioBusyChange(true);
      void audioModeCoordinator
        .requestPlayback(setAudioModeAsync, SCRIPTURE_PLAYBACK_MODE)
        .then((grant) => {
          if (!continuation.isCurrent()) return;
          if (!grant?.isCurrent()) {
            onAudioBusyChange(false);
            return;
          }
          player.play();
          setPhase('playing');
        })
        .catch((error) => {
          if (!continuation.isCurrent()) return;
          console.warn('Не удалось восстановить аудиорежим Писания', error);
          setPhase('error');
          onAudioBusyChange(false);
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
      try {
        const clip = await fetchScriptureAudioClip(scripture, voice, controller.signal);
        if (requestRef.current !== controller) return;
        const modeGrant = await audioModeCoordinator.requestPlayback(
          setAudioModeAsync,
          SCRIPTURE_PLAYBACK_MODE,
        );
        if (requestRef.current !== controller) return;
        if (!modeGrant?.isCurrent()) {
          setPhase('idle');
          onAudioBusyChange(false);
          return;
        }
        player.replace(clip.url);
        await player.seekTo(clip.startSeconds, 0, 0);
        if (requestRef.current !== controller) return;
        if (!modeGrant.isCurrent()) {
          setPhase('idle');
          onAudioBusyChange(false);
          return;
        }
        clipRef.current = clip;
        scriptureKeyRef.current = scriptureKey;
        player.play();
        setPhase('playing');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn(
          'Не удалось воспроизвести отрывок Писания',
          error instanceof Error ? error.message : 'unknown error',
        );
        setPhase('error');
        onAudioBusyChange(false);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
    })();
  }, [enabled, onAudioBusyChange, phase, playbackOperation, player, scripture, scriptureKey, voice]);

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
