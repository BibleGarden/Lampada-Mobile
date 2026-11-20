import type { RecordingOperationPhase } from './recordingOperation';

/** Sound sources of the prayer screen, during which music pauses. */
export type AudioBusySource = 'scripture' | 'answer';

export type AudioBusyBySource = Readonly<Record<AudioBusySource, boolean>>;

export const IDLE_AUDIO_SOURCES: AudioBusyBySource = { scripture: false, answer: false };

// Each source sets and clears only its own flag: closing the answer sheet
// does not clear the scripture narration's busy state, and vice versa.
export const setAudioSourceBusy = (
  state: AudioBusyBySource,
  source: AudioBusySource,
  busy: boolean,
): AudioBusyBySource => ({ ...state, [source]: busy });

/** Music plays only when every source is idle. */
export const isAudioBusy = (state: AudioBusyBySource) => state.scripture || state.answer;

/**
 * The answer sheet is idle only when no recording is in progress there
 * (including starting or stopping one), no draft is playing, and no limit
 * cue is sounding.
 */
export const isAnswerAudioIdle = ({ recordingPhase, draftActive, cueActive }: {
  recordingPhase: RecordingOperationPhase;
  draftActive: boolean;
  cueActive: boolean;
}) => recordingPhase === 'idle' && !draftActive && !cueActive;
