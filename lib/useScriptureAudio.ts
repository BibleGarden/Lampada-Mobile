import { useCallback, useEffect, useRef, useState } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import type { ScriptureDisplay } from './scripture';
import { fetchScriptureAudioClip, type ScriptureAudioClip } from './scriptureAudioClient';

export type ScriptureAudioPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type ScriptureAudioControl = {
  phase: ScriptureAudioPhase;
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
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<ScriptureAudioPhase>('idle');
  const clipRef = useRef<ScriptureAudioClip | null>(null);
  const scriptureKeyRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const stop = useCallback((nextPhase: ScriptureAudioPhase = 'idle') => {
    requestRef.current?.abort();
    requestRef.current = null;
    player.pause();
    clipRef.current = null;
    scriptureKeyRef.current = null;
    setPhase(nextPhase);
    onAudioBusyChange(false);
  }, [onAudioBusyChange, player]);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    const key = scripture ? `${scripture.canonicalId}:${scripture.receivedAt}` : null;
    if (scriptureKeyRef.current && scriptureKeyRef.current !== key) stop();
  }, [scripture, stop]);

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
      player.pause();
      onAudioBusyChange(false);
    },
    [onAudioBusyChange, player],
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
      onAudioBusyChange(true);
      player.play();
      setPhase('playing');
      return;
    }

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    scriptureKeyRef.current = `${scripture.canonicalId}:${scripture.receivedAt}`;
    setPhase('loading');
    onAudioBusyChange(true);
    void (async () => {
      try {
        const clip = await fetchScriptureAudioClip(scripture, voice, controller.signal);
        if (requestRef.current !== controller) return;
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
        });
        player.replace(clip.url);
        await player.seekTo(clip.startSeconds, 0, 0);
        if (requestRef.current !== controller) return;
        clipRef.current = clip;
        scriptureKeyRef.current = `${scripture.canonicalId}:${scripture.receivedAt}`;
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
  }, [enabled, onAudioBusyChange, phase, player, scripture, voice]);

  return { phase, toggle };
}
