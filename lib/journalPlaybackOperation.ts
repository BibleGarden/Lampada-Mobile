import type { AudioSessionLease, PlaybackAudioModeGrant } from './audioModeCoordinator';
import { createPlaybackLeaseOperation, JournalPlaybackStartError, startJournalPlayback } from './audioPlayerOperation.ts';
import { watchNativePlaybackStart, type NativePlaybackStartFailure, type NativePlaybackStatus } from './nativePlaybackStart.ts';

type JournalPlaybackStatus = NativePlaybackStatus & { didJustFinish: boolean; error: string | null };
type JournalPlaybackFailure = NativePlaybackStartFailure | 'player_error' | 'mode_failed' | 'play_failed' | 'start_failed';

/** Вся жизнь одного плеера дневника; dispose не вызывает нативные методы. */
export function createJournalPlaybackOperation({
  player,
  acquireSession,
  requestPlayback,
  onPlayingChange,
  onFailure,
  onReleaseFailure,
}: {
  player: { readonly currentStatus: NativePlaybackStatus; replace: (uri: string) => void; play: () => void; pause: () => void };
  acquireSession: () => AudioSessionLease;
  requestPlayback: () => Promise<PlaybackAudioModeGrant | null>;
  onPlayingChange: (uri: string | null) => void;
  onFailure: (uri: string, reason: JournalPlaybackFailure, error?: unknown) => void;
  onReleaseFailure: (error: unknown) => void;
}) {
  const playback = createPlaybackLeaseOperation();
  let activeUri: string | null = null;
  let started = false;
  let disposed = false;
  let generation = 0;
  let cancelWatch: (() => void) | null = null;

  const settle = (notify = true) => {
    generation += 1;
    cancelWatch?.();
    cancelWatch = null;
    activeUri = null;
    started = false;
    if (notify) onPlayingChange(null);
    void playback.cancel().catch(onReleaseFailure);
  };
  const stop = () => {
    try {
      if (!disposed && activeUri !== null) player.pause();
    } finally {
      settle(!disposed);
    }
  };
  const fail = (reason: JournalPlaybackFailure, error?: unknown) => {
    const uri = activeUri;
    if (disposed || uri === null) return;
    try {
      stop();
    } finally {
      onFailure(uri, reason, error);
    }
  };

  return {
    async start(uri: string) {
      if (disposed) return;
      stop();
      activeUri = uri;
      const attempt = generation;
      try {
        const playing = await startJournalPlayback(playback, acquireSession, requestPlayback, player, uri);
        if (disposed || attempt !== generation) return;
        if (!playing) {
          settle();
          return;
        }
        started = true;
        onPlayingChange(uri);
        cancelWatch = watchNativePlaybackStart({
          readStatus: () => player.currentStatus,
          onFailed: (reason, status) => {
            if (attempt === generation) fail(reason, status.playbackState);
          },
        });
      } catch (error) {
        if (disposed || attempt !== generation) return;
        fail(error instanceof JournalPlaybackStartError ? error.reason : 'start_failed', error);
      }
    },
    stop,
    status(status: JournalPlaybackStatus) {
      if (disposed || !started) return;
      if (status.error) fail('player_error', status.error);
      else if (status.didJustFinish) settle();
    },
    dispose() {
      disposed = true;
      settle(false);
    },
  };
}
