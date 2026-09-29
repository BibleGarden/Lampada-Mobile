import { waitForAudioPlayerReady, type AudioPlayerReadyStatus } from './audioPlayerOperation.ts';
import type { RecordingDraft } from './store.ts';

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

export const UNKNOWN_RECORDING_DURATION_SECONDS = 0;

/** Дробные секунды из готового файла без округления для серверного предела. */
export async function recordedFileDurationSeconds(
  readStatus: () => AudioPlayerReadyStatus,
  wait?: (millis: number) => Promise<void>,
): Promise<number> {
  await waitForAudioPlayerReady(readStatus, () => true, wait, 120);
  const duration = readStatus().duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Recorded audio file has no valid duration');
  }
  return duration;
}

/** Привязывает файл к черновику даже при сбое чтения длительности. */
export async function createStoppedRecordingDraft(
  uri: string,
  readDuration: () => Promise<number>,
  reportDurationError: (error: unknown) => void,
  id = Date.now(),
): Promise<RecordingDraft> {
  let durationSec = UNKNOWN_RECORDING_DURATION_SECONDS;
  try {
    const duration = await readDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Recorded audio file has no valid duration');
    }
    durationSec = Math.max(1, Math.round(duration));
  } catch (error) {
    reportDurationError(error);
  }
  return { id, uri, durationSec, transcript: null, transcriptState: 'idle' };
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
