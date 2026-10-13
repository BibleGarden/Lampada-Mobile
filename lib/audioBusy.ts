import type { RecordingOperationPhase } from './recordingOperation';

/** Источники звука экрана молитвы, на время которых музыка замолкает. */
export type AudioBusySource = 'scripture' | 'answer';

export type AudioBusyBySource = Readonly<Record<AudioBusySource, boolean>>;

export const IDLE_AUDIO_SOURCES: AudioBusyBySource = { scripture: false, answer: false };

// Каждый источник ставит и снимает только свой флаг: закрытие шторки ответа
// не снимает занятость озвучки цитаты, и наоборот.
export const setAudioSourceBusy = (
  state: AudioBusyBySource,
  source: AudioBusySource,
  busy: boolean,
): AudioBusyBySource => ({ ...state, [source]: busy });

/** Музыка играет, только когда свободны все источники. */
export const isAudioBusy = (state: AudioBusyBySource) => state.scripture || state.answer;

/**
 * Шторка ответа свободна, только когда в ней не идёт запись (в том числе её
 * старт или остановка), не играет черновик и не звучит сигнал лимита.
 */
export const isAnswerAudioIdle = ({ recordingPhase, draftActive, cueActive }: {
  recordingPhase: RecordingOperationPhase;
  draftActive: boolean;
  cueActive: boolean;
}) => recordingPhase === 'idle' && !draftActive && !cueActive;
