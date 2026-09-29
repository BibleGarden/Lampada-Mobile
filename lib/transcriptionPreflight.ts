import { recordingFileIssue, type RecordingFileMetadata } from './recordingFile.ts';
import { recordingExceedsDurationLimit, recordingExceedsUploadLimit } from './transcriptionLimits.ts';
import { TranscriptionError } from './transcriptionErrors.ts';

/** Проверяет реальный файл до создания запроса; длительность остаётся дробной. */
export async function validateTranscriptionFile(
  file: RecordingFileMetadata,
  readDuration: () => Promise<number>,
): Promise<number> {
  const issue = recordingFileIssue(file);
  if (issue) throw new Error(`Recording file is ${issue}`);
  if (file.size === null) throw new Error('Recording file size is unavailable');
  if (recordingExceedsUploadLimit(file.size)) throw new TranscriptionError('too_long');
  const duration = await readDuration();
  if (recordingExceedsDurationLimit(duration)) throw new TranscriptionError('too_long');
  return duration;
}
