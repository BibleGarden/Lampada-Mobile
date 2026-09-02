export type AudioModeRequest = {
  allowsRecording: boolean;
  playsInSilentMode: boolean;
  shouldPlayInBackground?: boolean;
  interruptionMode?: 'mixWithOthers' | 'duckOthers' | 'doNotMix';
};

type ApplyAudioMode = (mode: AudioModeRequest) => Promise<void>;

export type RecordingAudioModeLease = {
  /** Resolves after all older mode changes and this recording mode were applied. */
  ready: Promise<void>;
  isActive: () => boolean;
  /** Call only after the native recorder is known to have stopped. */
  release: () => boolean;
};

export type PlaybackAudioModeGrant = {
  /** False once a recording or a newer playback request supersedes this grant. */
  isCurrent: () => boolean;
};

// Transient players share AVAudioSession with the recorder. Expo's default
// schedules a global session deactivation 100 ms after pause/completion, which
// can terminate a recorder that started in that window on physical iOS.
export const TRANSIENT_AUDIO_PLAYER_OPTIONS = {
  keepAudioSessionActive: true,
} as const;

/**
 * Serializes changes to Expo's process-wide audio mode.
 *
 * A recording lease becomes active synchronously. This rejects newer playback
 * requests immediately, while its own mode change remains ordered behind work
 * that was already queued. Thus an older playback request cannot land after a
 * recorder has been prepared and stop it on iOS.
 */
export function createAudioModeCoordinator() {
  type LeaseToken = { released: boolean };

  let tail: Promise<void> = Promise.resolve();
  let recordingLease: LeaseToken | null = null;
  let playbackGeneration = 0;

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    acquireRecording(
      applyAudioMode: ApplyAudioMode,
      mode: AudioModeRequest,
    ): RecordingAudioModeLease {
      if (recordingLease) {
        throw new Error('A recording audio-mode lease is already active');
      }

      const token: LeaseToken = { released: false };
      recordingLease = token;
      // Invalidates continuations of playback requests whose native call may
      // already be in flight. They must re-check their grant before play().
      playbackGeneration += 1;
      const ready = enqueue(async () => {
        await applyAudioMode(mode);
      }).catch((error) => {
        // A failed acquisition never enabled recording, so it must not leave
        // playback blocked indefinitely.
        if (recordingLease === token) recordingLease = null;
        token.released = true;
        throw error;
      });

      return {
        ready,
        isActive: () => recordingLease === token && !token.released,
        release: () => {
          if (recordingLease !== token || token.released) return false;
          token.released = true;
          recordingLease = null;
          return true;
        },
      };
    },

    requestPlayback(
      applyAudioMode: ApplyAudioMode,
      mode: AudioModeRequest,
    ): Promise<PlaybackAudioModeGrant | null> {
      const generation = ++playbackGeneration;
      // Check before enqueueing: a request made after recording acquisition
      // must never run later after the lease has been released.
      if (recordingLease) return Promise.resolve(null);
      return enqueue(async () => {
        if (recordingLease || generation !== playbackGeneration) return null;
        await applyAudioMode(mode);
        return {
          isCurrent: () =>
            recordingLease === null && generation === playbackGeneration,
        };
      });
    },

    requestDeactivation(deactivate: () => Promise<void>): Promise<boolean> {
      const generation = ++playbackGeneration;
      if (recordingLease) return Promise.resolve(false);
      return enqueue(async () => {
        if (recordingLease || generation !== playbackGeneration) return false;
        await deactivate();
        return true;
      });
    },

    hasRecordingLease: () => recordingLease !== null,
  };
}

export const audioModeCoordinator = createAudioModeCoordinator();
