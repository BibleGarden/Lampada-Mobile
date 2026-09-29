import { createAudioPlayer } from 'expo-audio';
import { TRANSIENT_AUDIO_PLAYER_OPTIONS } from './audioModeCoordinator';
import { recordedFileDurationSeconds } from './recordingFile';

/** Загружает длительность из файла, не запуская воспроизведение. */
export async function audioFileDurationSeconds(uri: string): Promise<number> {
  const player = createAudioPlayer(uri, TRANSIENT_AUDIO_PLAYER_OPTIONS);
  try {
    return await recordedFileDurationSeconds(() => player.currentStatus);
  } finally {
    player.release();
  }
}
