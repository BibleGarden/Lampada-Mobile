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
