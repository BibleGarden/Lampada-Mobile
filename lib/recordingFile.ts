const MIN_RECORDING_BYTES = 1_024;
// A tap that starts recording can be retargeted to the stop overlay when it
// appears under the finger. Such an M4A can contain a valid-looking container
// header, but no useful audio frames, so file size alone is not enough.
const MIN_RECORDING_DURATION_MILLIS = 500;
// HIGH_QUALITY targets 128 kbit/s. Half of that rate leaves enough margin for
// platform/container differences while still detecting a recorder that was
// stopped natively but whose JS timer continued to run.
const MIN_RECORDING_BYTES_PER_MILLISECOND = 8;

export type RecordingFileMetadata = {
  exists: boolean;
  size: number;
};

export function recordingFileIssue(
  file: RecordingFileMetadata,
  durationMillis: number,
): 'missing' | 'incomplete' | null {
  // This is intentionally a cheap client-side completeness heuristic, not a
  // media-container parser. The transcription service remains responsible for
  // validating the M4A container before passing it to the model.
  if (!file.exists) return 'missing';
  if (durationMillis < MIN_RECORDING_DURATION_MILLIS) return 'incomplete';
  const minimumSize = Math.max(
    MIN_RECORDING_BYTES,
    Math.floor(Math.max(0, durationMillis) * MIN_RECORDING_BYTES_PER_MILLISECOND),
  );
  return file.size < minimumSize ? 'incomplete' : null;
}
