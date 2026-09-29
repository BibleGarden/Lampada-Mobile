import type { AudioSessionLease } from './audioModeCoordinator';

/** Владеет одной попыткой воспроизведения, нативным слушателем и lease. */
export function createPlaybackLeaseOperation() {
  let generation = 0;
  let lease: AudioSessionLease | null = null;
  let statusSubscription: { remove: () => void } | null = null;

  const cancel = (): Promise<void> => {
    generation += 1;
    statusSubscription?.remove();
    statusSubscription = null;
    const currentLease = lease;
    lease = null;
    return currentLease?.release() ?? Promise.resolve();
  };

  return {
    begin(nextLease: AudioSessionLease) {
      if (lease) throw new Error('A draft playback lease is already active');
      lease = nextLease;
      generation += 1;
      return generation;
    },
    isCurrent: (attempt: number) => lease !== null && generation === attempt,
    attachStatus(attempt: number, subscription: { remove: () => void }) {
      if (lease === null || generation !== attempt) {
        subscription.remove();
        return false;
      }
      if (statusSubscription) throw new Error('Draft playback status listener is already active');
      statusSubscription = subscription;
      return true;
    },
    cancel,
    complete(attempt: number): Promise<void> {
      if (lease === null || generation !== attempt) return Promise.resolve();
      return cancel();
    },
  };
}

export type AudioPlayerReadyStatus = {
  isLoaded: boolean;
  duration: number;
  error: string | null;
};

const PLAYER_READY_POLL_MILLIS = 25;
const PLAYER_READY_ATTEMPTS = 40;

/** Waits until a replaced local AVPlayerItem is ready before calling play(). */
export async function waitForAudioPlayerReady(
  readStatus: () => AudioPlayerReadyStatus,
  isCurrent: () => boolean,
  wait: (millis: number) => Promise<void> = (millis) =>
    new Promise((resolve) => setTimeout(resolve, millis)),
  attempts = PLAYER_READY_ATTEMPTS,
) {
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    if (!isCurrent()) return false;
    const status = readStatus();
    if (status.error) throw new Error(status.error);
    if (status.isLoaded && status.duration > 0) return true;
    if (attempt + 1 < attempts) await wait(PLAYER_READY_POLL_MILLIS);
  }
  throw new Error('Audio player did not load the recording in time');
}

type RecordingAudioPlayer = {
  readonly currentStatus: AudioPlayerReadyStatus;
  replace: (uri: string) => void;
  seekTo: (seconds: number, toleranceBefore: number, toleranceAfter: number) => Promise<void>;
  play: () => void;
};

/** Resuming preserves the loaded item and its native playback position. */
export async function playAudioRecording(
  player: RecordingAudioPlayer,
  uri: string,
  resume: boolean,
  isCurrent: () => boolean,
  beforePlay?: () => void,
) {
  if (!isCurrent()) return false;
  if (!resume) player.replace(uri);
  const ready = await waitForAudioPlayerReady(() => player.currentStatus, isCurrent);
  if (!ready || !isCurrent()) return false;
  if (!resume) await player.seekTo(0, 0, 0);
  if (!isCurrent()) return false;
  beforePlay?.();
  if (!isCurrent()) return false;
  player.play();
  return true;
}
