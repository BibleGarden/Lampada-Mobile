import { waitForAudioPlayerReady, type AudioPlayerReadyStatus } from './audioPlayerOperation.ts';

const MIN_RECORDING_BYTES = 1_024;
const FILE_READY_POLL_MILLIS = 50;
const FILE_READY_ATTEMPTS = 10;

export type RecordingFileMetadata = {
  exists: boolean;
  size: number | null;
};

export function recordingFileIssue(
  file: RecordingFileMetadata,
): 'missing' | 'incomplete' | null {
  if (!file.exists) return 'missing';
  // AAC bitrate is a target, not a guaranteed minimum. A duration-proportional
  // threshold deleted valid quiet recordings on physical iOS devices.
  return file.size === null || file.size < MIN_RECORDING_BYTES ? 'incomplete' : null;
}

/** Целые секунды для текущего отсчёта записи. */
export function recordedSeconds(durationMillis: number) {
  return Math.floor(durationMillis / 1000);
}

/** Длительность берём из готового файла; округление вверх не пропустит 600.1 с как 600 с. */
export async function recordedFileSeconds(
  readStatus: () => AudioPlayerReadyStatus,
  wait?: (millis: number) => Promise<void>,
): Promise<number> {
  await waitForAudioPlayerReady(readStatus, () => true, wait, 120);
  const duration = readStatus().duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Recorded audio file has no valid duration');
  }
  return Math.ceil(duration);
}

/** Waits for AVAudioRecorder to finish publishing stable file metadata. */
export async function waitForRecordingFile(
  readMetadata: () => RecordingFileMetadata,
  wait: (millis: number) => Promise<void> = (millis) =>
    new Promise((resolve) => setTimeout(resolve, millis)),
  attempts = FILE_READY_ATTEMPTS,
) {
  let metadata: RecordingFileMetadata = { exists: false, size: null };
  let previousReadySize: number | null = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    metadata = readMetadata();
    const readySize = metadata.exists && metadata.size !== null && metadata.size >= MIN_RECORDING_BYTES
      ? metadata.size
      : null;
    if (readySize !== null && readySize === previousReadySize) return metadata;
    previousReadySize = readySize;
    if (attempt + 1 < attempts) await wait(FILE_READY_POLL_MILLIS);
  }
  return metadata;
}
