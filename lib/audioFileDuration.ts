import { createAudioPlayer } from 'expo-audio';
import { TRANSIENT_AUDIO_PLAYER_OPTIONS } from './audioModeCoordinator';
import { recordedFileDurationSeconds } from './recordingFile';

/** Loads the duration from the file without starting playback. */
export async function audioFileDurationSeconds(uri: string): Promise<number> {
  const player = createAudioPlayer(uri, TRANSIENT_AUDIO_PLAYER_OPTIONS);
  try {
    return await recordedFileDurationSeconds(() => player.currentStatus);
  } finally {
    player.release();
  }
}
