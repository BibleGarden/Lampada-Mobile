import { useI18n } from '../lib/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useSession, RecordingDraft } from '../lib/store';
import { transcribeRecording } from '../lib/transcription';
import { audioFileDurationSeconds } from '../lib/audioFileDuration';
import { MAX_RECORDING_SECONDS, recordingLimitDisplay } from '../lib/transcriptionLimits';
import { useRecordingLimit } from '../lib/useRecordingLimit';
import { transcriptionFailureCode } from '../lib/transcriptionErrors';
import { ensureSettingsLoaded, useSettings } from '../lib/settings';
import {
  createAnswerSaveFlight,
  saveAnswerDraft,
  type AnswerSaveMode,
} from '../lib/answerSave';
import { recordDiagnostic } from '../lib/db';
import { createStoppedRecordingDraft, recordingFileIssue, waitForRecordingFile } from '../lib/recordingFile';
import {
  createRecordingOperation,
  recoverRecordingAfterTerminalError,
  recorderStatusRequiresRecovery,
  startPreparedRecording,
} from '../lib/recordingOperation';
import {
  audioModeCoordinator,
  TRANSIENT_AUDIO_PLAYER_OPTIONS,
  type RecordingAudioModeLease,
  type AudioSessionLease,
} from '../lib/audioModeCoordinator';
import { colors, column, fonts, isTablet, radius, sc, touchSlop, useStyles } from '../lib/theme';
import { useSheetReflow } from '../lib/useSheetReflow';
import { screenReaderHiddenProps } from '../lib/a11y';
import { createPlaybackLeaseOperation, playAudioRecording, shouldClearDraftAudioBusy, waitForAudioPlayerReady } from '../lib/audioPlayerOperation';
import { playCueUntilComplete } from '../lib/audioCueOperation';
import { Mic } from './icons';
import RecordingsSheet from './RecordingsSheet';
import PrivacyConsentDialog from './PrivacyConsentDialog';
import { GoldButton } from './ui';

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 48_000,
  web: { ...RecordingPresets.HIGH_QUALITY.web, bitsPerSecond: 48_000 },
  // Expo Audio otherwise uses cache, which iOS may clear at any time.
  directory: 'document' as const,
};

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  /** Единственный способ открыть шторку: черновик готовится ДО анимации,
   * иначе на открытии мелькает контент прошлого вопроса */
  openRef: React.MutableRefObject<(() => void) | null>;
  /** Сессия зовёт это перед уходом на рефлексию: дописать открытый черновик */
  flushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** Завершение сессии ждёт закрытия ответа, включая остановку записи. */
  onOpenChange?: (open: boolean) => void;
  /** Музыка сессии уступает аудиофокус записи и прослушиванию черновика. */
  onAudioBusyChange?: (busy: boolean) => void;
};

const MIN_UI_RECORDING_MILLIS = 1_500;
const DRAFT_PLAYBACK_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  interruptionMode: 'doNotMix' as const,
};
const LIMIT_CUE_PLAYBACK_MODE = {
  ...DRAFT_PLAYBACK_MODE,
  interruptionMode: 'mixWithOthers' as const,
};

// Шторка ответа: текст ответа и счётчик голосовых записей. Сами записи живут
// в отдельной шторке поверх (RecordingsSheet). Открывается на текущем вопросе,
// черновик считывается из сохранённого ответа.
export default function AnswerSheet({
  sheetRef,
  openRef,
  flushRef,
  onOpenChange,
  onAudioBusyChange,
}: Props) {
  const { t, language } = useI18n();
  const limitDisplay = recordingLimitDisplay(MAX_RECORDING_SECONDS, language);
  const limitLabel = `${limitDisplay.count} ${t(limitDisplay.unitKey)}`;
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  // подписка только на нужное — не ререндерим шторку от тика таймера
  const questions = useSession((st) => st.questions);
  const qIndex = useSession((st) => st.qIndex);
  const saveAnswerToStore = useSession((st) => st.saveAnswer);
  const [text, setText] = useState('');
  const answerInputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const [recs, setRecs] = useState<RecordingDraft[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Расшифровка показывается свёрнутой — три строки; раскрытая читается целиком.
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<number, boolean>>({});
  const [recordingsSheetOpen, setRecordingsSheetOpen] = useState(false);
  const recSheetRef = useRef<BottomSheet | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [pausedId, setPausedId] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [recordingPhase, setRecordingPhase] = useState<
    'idle' | 'starting' | 'recording' | 'stopping'
  >('idle');
  const [saving, setSaving] = useState(false);
  const [answerConsentOpen, setAnswerConsentOpen] = useState(false);
  const [audioConsentOpen, setAudioConsentOpen] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSheetRef = useRef(false); // фактическое состояние шторки (для слушателей клавиатуры)
  const [saveFlight] = useState(createAnswerSaveFlight);
  const recsRef = useRef<RecordingDraft[]>([]);
  const pendingTranscriptions = useRef(
    new Map<number, { controller: AbortController; promise: Promise<void> }>(),
  );
  const pendingConsentRecording = useRef<RecordingDraft | null>(null);
  // Не даём keyboardDidHide вернуть шторку на 62% после старта записи.
  const recordingOverlayActiveRef = useRef(false);
  // Только эти файлы принадлежат текущему несохранённому черновику. Записи,
  // загруженные из сохранённого ответа, нельзя удалять при отмене редактирования.
  const unsavedRecordingUris = useRef(new Set<string>());
  // qIndex фиксируется при открытии шторки: пока человек пишет, индекс в store
  // может уехать (навигация, генерация) — ответ должен лечь под свой вопрос
  const answerIndexRef = useRef(0);
  const recorderErrorRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingsSheetGenerationRef = useRef(0);
  const recordingAudioModeLeaseRef = useRef<RecordingAudioModeLease | null>(null);
  const recordingSessionLeaseRef = useRef<AudioSessionLease | null>(null);
  const activeDraftIdRef = useRef<number | null>(null);
  const draftPlaybackOperationRef = useRef<ReturnType<typeof createPlaybackLeaseOperation> | null>(null);
  if (!draftPlaybackOperationRef.current) {
    draftPlaybackOperationRef.current = createPlaybackLeaseOperation();
  }
  const draftPlaybackOperation = draftPlaybackOperationRef.current;
  const reportReleaseError = (error: unknown) => {
    console.error('Failed to release audio session', error);
  };
  const observeRelease = (operation: Promise<void>) => {
    void operation.catch(reportReleaseError);
  };
  const cancelDraftPlayback = () => {
    activeDraftIdRef.current = null;
    observeRelease(draftPlaybackOperation.cancel());
  };
  const releaseRecordingSession = () => {
    const lease = recordingSessionLeaseRef.current;
    recordingSessionLeaseRef.current = null;
    return lease?.release() ?? Promise.resolve();
  };
  const recordingSheetOpenRef = useRef(false);
  // Нативный recorderState обновляется с задержкой и не подходит как mutex.
  // Pure coordinator синхронно держит фазу, state только отражает её в UI.
  const recordingOperationRef = useRef<ReturnType<typeof createRecordingOperation> | null>(null);
  if (!recordingOperationRef.current) {
    recordingOperationRef.current = createRecordingOperation(setRecordingPhase);
  }
  const recordingOperation = recordingOperationRef.current;

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    const phase = recordingOperation.getPhase();
    if (
      status.isFinished && !status.hasError &&
      !status.mediaServicesDidReset && recorder.isRecording
    ) return;
    if (!recorderStatusRequiresRecovery(phase, status)) return;
    const lease = recordingAudioModeLeaseRef.current;
    recorderErrorRef.current =
      status.error || (status.isFinished ? 'Audio recorder finished unexpectedly' : 'Audio recorder was interrupted');
    recordingStartedAtRef.current = null;
    recordingOverlayActiveRef.current = false;
    recoverRecordingAfterTerminalError(recordingOperation, lease);
    observeRelease(releaseRecordingSession());
    if (recordingAudioModeLeaseRef.current === lease) {
      recordingAudioModeLeaseRef.current = null;
    }
    setAudioError('components.answers.interrupted');
    onAudioBusyChange?.(false);
    void audioModeCoordinator
      .requestPlayback(setAudioModeAsync, {
        allowsRecording: false,
        playsInSilentMode: true,
      })
      .catch((error) => {
        console.error('Failed to restore audio mode', error);
        throw error;
      });
  });
  const player = useAudioPlayer(null, TRANSIENT_AUDIO_PLAYER_OPTIONS);
  const playerStatus = useAudioPlayerStatus(player);
  const limitCuePlayer = useAudioPlayer(null, TRANSIENT_AUDIO_PLAYER_OPTIONS);
  const nativeAudioMountedRef = useRef(true);
  const limitCueOperationRef = useRef(createPlaybackLeaseOperation());
  const limitCueOperation = limitCueOperationRef.current;
  const limitCueCompletionRef = useRef<(() => void) | null>(null);
  const limitCueActiveRef = useRef(false);
  const cancelLimitCue = (pausePlayer = true) => {
    limitCueCompletionRef.current?.();
    limitCueCompletionRef.current = null;
    if (pausePlayer && nativeAudioMountedRef.current) limitCuePlayer.pause();
    limitCueActiveRef.current = false;
    return limitCueOperation.cancel();
  };

  const playLimitCue = async () => {
    const generation = limitCueOperation.begin(() =>
      audioModeCoordinator.acquireSession(() => setIsAudioActiveAsync(false)),
    );
    limitCueActiveRef.current = true;
    try {
      const grant = await audioModeCoordinator.requestPlayback(setAudioModeAsync, LIMIT_CUE_PLAYBACK_MODE);
      const isCurrent = () => limitCueOperation.isCurrent(generation) && !!grant?.isCurrent();
      if (!isCurrent()) return;
      limitCuePlayer.replace(require('../assets/audio/recording-limit.wav'));
      if (!(await waitForAudioPlayerReady(() => limitCuePlayer.currentStatus, isCurrent))) return;
      const playback = playCueUntilComplete(limitCuePlayer, isCurrent);
      limitCueCompletionRef.current = playback.cancel;
      await playback.promise;
    } finally {
      limitCueCompletionRef.current = null;
      const ownsCue = limitCueOperation.isCurrent(generation);
      limitCueActiveRef.current = false;
      if (nativeAudioMountedRef.current) limitCuePlayer.pause();
      await limitCueOperation.complete(generation);
      if (ownsCue) onAudioBusyChange?.(false);
    }
  };

  // вторая точка — для открытой клавиатуры и для контента, который перестал
  // помещаться: keyboardBehavior="extend" поднимает шторку до верхней, и поле
  // ввода с кнопками остаются видны. Верхняя точка — вся высота под
  // статус-баром (topInset).
  const { mountKey, open, onIndexChange } = useSheetReflow();
  const snapPoints = useMemo(() => ['62%', '100%'], []);
  const questionRef = useRef<Text>(null);

  // Экран под шторкой скрыт от программ чтения с экрана, и фокус с кнопки
  // «Ответить» уходит в никуда — ставим его на вопрос.
  useEffect(() => {
    if (open && questionRef.current) AccessibilityInfo.sendAccessibilityEvent(questionRef.current, 'focus');
  }, [open]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // Контейнер контента у шторки всегда высотой в верхнюю точку, а ручка
  // абсолютная — flex по ним не посчитать. Поэтому высоту тела считаем сами:
  // видимая часть шторки = высота окна минус её позиция.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const landscapeTablet = isTablet() && windowWidth > windowHeight;
  const handleHeight = sc(22);
  const sheetPosition = useSharedValue(windowHeight);
  const keyboardHeight = useSharedValue(0);
  const bodyStyle = useAnimatedStyle(() => ({
    height: Math.max(
      0,
      windowHeight - sheetPosition.value - handleHeight - keyboardHeight.value,
    ),
  }));

  const updateRecs = useCallback(
    (updater: (current: RecordingDraft[]) => RecordingDraft[]) => {
      const next = updater(recsRef.current);
      recsRef.current = next;
      setRecs(next);
    },
    [],
  );

  const abortAllTranscriptions = useCallback(() => {
    for (const pending of pendingTranscriptions.current.values()) {
      pending.controller.abort();
    }
    pendingTranscriptions.current.clear();
  }, []);

  const runTranscription = useCallback(
    (recording: RecordingDraft) => {
      if (saveFlight.isActive()) return;
      pendingTranscriptions.current.get(recording.id)?.controller.abort();
      const controller = new AbortController();
      updateRecs((current) =>
        current.map((item) =>
          item.id === recording.id ? { ...item, transcriptState: 'loading', transcriptError: undefined } : item,
        ),
      );

      const promise = transcribeRecording(recording.uri, controller.signal)
        .then((transcript) => {
          if (pendingTranscriptions.current.get(recording.id)?.controller !== controller) return;
          updateRecs((current) =>
            current.map((item) =>
              item.id === recording.id
                ? { ...item, transcript, transcriptState: 'idle' }
                : item,
            ),
          );
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn(
            'Failed to transcribe audio recording',
            error instanceof Error ? error.message : 'unknown error',
          );
          updateRecs((current) =>
            current.map((item) =>
              item.id === recording.id
                ? { ...item, transcriptState: 'error', transcriptError: transcriptionFailureCode(error) }
                : item,
            ),
          );
        })
        .finally(() => {
          if (pendingTranscriptions.current.get(recording.id)?.controller === controller) {
            pendingTranscriptions.current.delete(recording.id);
          }
        });

      pendingTranscriptions.current.set(recording.id, { controller, promise });
    },
    [saveFlight, updateRecs],
  );

  const startTranscription = useCallback(
    async (recording: RecordingDraft) => {
      if (saveFlight.isActive()) return;
      await ensureSettingsLoaded();
      const decision = useSettings.getState().audioTranscriptionConsent;
      if (decision === 'undecided') {
        pendingConsentRecording.current = recording;
        setAudioConsentOpen(true);
        return;
      }
      if (decision === 'denied') {
        setAudioError('components.answers.transcriptionDisabled');
        return;
      }
      runTranscription(recording);
    },
    [runTranscription, saveFlight],
  );

  const decideAudioConsent = useCallback(async (decision: 'allowed' | 'denied') => {
    await useSettings.getState().setConsent('audio_transcription', decision);
    const recording = pendingConsentRecording.current;
    pendingConsentRecording.current = null;
    setAudioConsentOpen(false);
    if (decision === 'allowed' && recording) runTranscription(recording);
  }, [runTranscription]);

  const toggleTranscript = useCallback((id: number) => {
    setExpandedTranscripts((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  // Единственный способ поправить распознанное: перенести в ответ и править там.
  // Шторку записей при этом закрываем — иначе текст ложится в поле за ней и
  // непонятно, сработало ли действие.
  const appendTranscriptToAnswer = useCallback((transcript: string) => {
    const addition = transcript.trim();
    if (!addition) return;
    setText((current) => (current.trim() ? `${current.trim()}\n\n${addition}` : addition));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recSheetRef.current?.close();
  }, []);

  // черновик текущего вопроса подтягивается ДО показа шторки: если делать
  // это в onChange, на открытии успевает мелькнуть контент прошлого вопроса
  const handleOpen = useCallback(() => {
    openSheetRef.current = true;
    onOpenChange?.(true);
    abortAllTranscriptions();
    const st = useSession.getState();
    answerIndexRef.current = st.qIndex;
    const a = st.answers[st.qIndex];
    setText(a?.text ?? '');
    const restored = a?.recordings
      ? a.recordings.map((r) => ({ ...r, transcriptState: 'idle' as const }))
      : [];
    recsRef.current = restored;
    setRecs(restored);
    setConfirmDeleteId(null);
    setExpandedTranscripts({});
    setConfirmCancel(false);
    setPlayingId(null);
    setPausedId(null);
    setAudioError(null);
    recorderErrorRef.current = null;
    sheetRef.current?.snapToIndex(0);
  }, [abortAllTranscriptions, sheetRef, onOpenChange]);

  useEffect(() => {
    openRef.current = handleOpen;
    return () => {
      openRef.current = null;
    };
  }, [openRef, handleOpen]);

  useEffect(() => {
    nativeAudioMountedRef.current = true;
    return () => {
      // Expo уже мог освободить shared objects до cleanup этого эффекта.
      nativeAudioMountedRef.current = false;
      recordingSheetOpenRef.current = false;
      cancelDraftPlayback();
      observeRelease(cancelLimitCue(false));
      recordingOperation.cancelStart();
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      abortAllTranscriptions();
      const phase = recordingOperation.getPhase();
      if (phase === 'recording') {
        // useAudioRecorder сам освобождает нативный recorder при unmount.
        recordingAudioModeLeaseRef.current?.release();
        recordingAudioModeLeaseRef.current = null;
        observeRelease(releaseRecordingSession());
        onAudioBusyChange?.(false);
      } else if (phase === 'stopping') {
        // Незавершённый stop сам освободит lease после ответа нативного слоя.
        const pendingStop = recordingOperation.getPendingStop();
        const releaseAfterUnmount = () => {
          recordingAudioModeLeaseRef.current?.release();
          recordingAudioModeLeaseRef.current = null;
          observeRelease(releaseRecordingSession());
          onAudioBusyChange?.(false);
        };
        if (pendingStop) {
          void pendingStop.then(releaseAfterUnmount, releaseAfterUnmount);
        } else {
          releaseAfterUnmount();
        }
      } else {
        observeRelease(releaseRecordingSession());
        onAudioBusyChange?.(false);
      }
    };
  }, [abortAllTranscriptions, onAudioBusyChange, recordingOperation]);

  // клавиатура появилась — шторка на верхнюю точку, чтобы поле ввода
  // и кнопки остались видны; спряталась — обратно на нижнюю.
  // Слушатель, а не onFocus: свой snap шторка перебивает при показе клавиатуры
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHeight.value = e.endCoordinates.height;
      setKeyboardOpen(true);
      if (openSheetRef.current) sheetRef.current?.snapToIndex(1);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeight.value = 0;
      setKeyboardOpen(false);
      if (openSheetRef.current && !recordingOverlayActiveRef.current) {
        sheetRef.current?.snapToIndex(0);
      }
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [sheetRef, keyboardHeight]);

  const startRecording = async () => {
    if (!recordingSheetOpenRef.current) return;

    const attempt = recordingOperation.beginStart();
    if (!attempt) return;
    cancelDraftPlayback();
    observeRelease(cancelLimitCue());
    // Оверлей записи не должен остаться под открытой клавиатурой.
    Keyboard.dismiss();
    // Сначала синхронно останавливаем музыку/черновик, затем меняем глобальный
    // audio mode: иначе музыка может попасть в начало голосовой записи.
    player.pause();
    setPlayingId(null);
    setPausedId(null);
    onAudioBusyChange?.(true);
    recorderErrorRef.current = null;
    setAudioError(null);
    let audioModeEnabled = false;
    let prepared = false;
    let started = false;
    let nativeStopConfirmed = false;
    let nativeCleanupUncertain = false;
    let audioModeLease: RecordingAudioModeLease | null = null;
    let sessionLease: AudioSessionLease | null = null;
    const discardPreparedFile = () => {
      const uri = recorder.uri;
      if (!uri) return;
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Отмена старта важнее best-effort очистки пустого файла.
      }
    };
    const startIsCurrent = () =>
      nativeAudioMountedRef.current && attempt.isCurrent() && recordingSheetOpenRef.current;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      if (!startIsCurrent()) return;
      if (recordingSessionLeaseRef.current) {
        throw new Error('A recording already owns an audio session lease');
      }
      sessionLease = audioModeCoordinator.acquireSession(
        () => setIsAudioActiveAsync(false),
      );
      recordingSessionLeaseRef.current = sessionLease;
      audioModeLease = audioModeCoordinator.acquireRecording(setAudioModeAsync, {
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioModeLease.ready;
      recordingAudioModeLeaseRef.current = audioModeLease;
      audioModeEnabled = true;
      if (!startIsCurrent()) return;
      // пресет обязателен: без options рекордер переиспользует один URL
      // и каждая новая запись затирает файл предыдущей
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      prepared = true;
      if (!startIsCurrent()) {
        if (!nativeAudioMountedRef.current) {
          nativeStopConfirmed = true; // Нативный recorder уже удалён хуком Expo.
          return;
        }
        // Android не разрешает повторный prepare, пока предыдущий MediaRecorder
        // не reset. stop() после prepare освобождает его даже без record().
        await recorder.stop();
        nativeStopConfirmed = true;
        discardPreparedFile();
        return;
      }
      // Do not re-prepare this native recorder in-place after a failed start.
      // On iOS a late delegate callback from the replaced AVAudioRecorder can
      // reset the state/duration of the new recording and corrupt its stop.
      startPreparedRecording(recorder);
      recordingStartedAtRef.current = Date.now();
      // Шторку могли программно закрыть между последним await и record().
      // Тогда немедленно гасим нативную запись и не создаём черновик.
      if (!startIsCurrent()) {
        if (!nativeAudioMountedRef.current) {
          nativeStopConfirmed = true;
          return;
        }
        await recorder.stop();
        nativeStopConfirmed = true;
        const cancelledUri = recorder.uri;
        if (cancelledUri) {
          try {
            const cancelledFile = new File(cancelledUri);
            if (cancelledFile.exists) cancelledFile.delete();
          } catch {
            // Отмена старта важнее best-effort очистки временного файла.
          }
        }
        return;
      }
      started = recordingLimit.commitStart(attempt);
      if (!started) return;
      recordingOverlayActiveRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.warn(
        'Failed to start audio recording',
        error instanceof Error ? error.message : 'unknown error',
      );
      setAudioError('components.answers.startFailed');
    } finally {
      // После успешного старта режим вернёт stopRecording. Во всех остальных
      // исходах (отказ, ошибка, dismiss) восстанавливаем его здесь.
      try {
        if (!started) {
          // Ошибка могла случиться после успешного prepare, но до record().
          // Освобождаем подготовленный Android-recorder для следующей попытки.
          if (prepared && !nativeStopConfirmed) {
            if (!nativeAudioMountedRef.current) {
              nativeStopConfirmed = true; // Expo освободил recorder при unmount.
            } else {
              try {
                await recorder.stop();
                nativeStopConfirmed = true;
                discardPreparedFile();
              } catch {
                // Без подтверждённого stop lease остаётся активным: playback mode
                // на iOS мог бы оборвать всё ещё живой нативный recorder.
                nativeCleanupUncertain = true;
              }
            }
          }
          if (nativeCleanupUncertain && attempt.recoverAsRecording()) {
            // Не возвращаем idle при неизвестном нативном состоянии. Показываем
            // управление stop снова и удерживаем recording lease/audio busy.
            started = true;
            recordingSheetOpenRef.current = true;
            recordingOverlayActiveRef.current = true;
            recSheetRef.current?.snapToIndex(0);
            setAudioError('components.answers.cancelFailed');
          }
          if (audioModeEnabled) {
            if (!prepared || nativeStopConfirmed) {
              audioModeLease?.release();
              if (recordingSessionLeaseRef.current === sessionLease) {
                await releaseRecordingSession().catch(reportReleaseError);
              }
              if (recordingAudioModeLeaseRef.current === audioModeLease) {
                recordingAudioModeLeaseRef.current = null;
              }
              await audioModeCoordinator
                .requestPlayback(setAudioModeAsync, {
                  allowsRecording: false,
                  playsInSilentMode: true,
                });
            }
          }
          if (sessionLease && !audioModeEnabled && recordingSessionLeaseRef.current === sessionLease) {
            await releaseRecordingSession().catch(reportReleaseError);
          }
        }
      } finally {
        // Новому start нельзя вклиниться раньше, чем старый вернул audio mode.
        attempt.finish();
        if (!started) {
          onAudioBusyChange?.(false);
        }
      }
    }
  };

  // Микрофон в шторке ответа ведёт в записи. Пустой список — сразу пишем:
  // человек нажал микрофон, чтобы говорить, а не чтобы смотреть на пустоту.
  const openRecordings = () => {
    Keyboard.dismiss();
    recordingsSheetGenerationRef.current += 1;
    setConfirmDeleteId(null);
    setRecordingsSheetOpen(true);
    recordingSheetOpenRef.current = true;
    recSheetRef.current?.snapToIndex(0);
    if (recsRef.current.length === 0) void startRecording();
  };

  const performStopRecording = async (
    confirmNativeStop: () => void,
    keepAudioBusy = false,
  ): Promise<RecordingDraft | null> => {
    const uriBeforeStop = recorder.uri;
    let nativeStopped = false;
    try {
      await recorder.stop();
      nativeStopped = true;
      confirmNativeStop();
      const uri = nativeAudioMountedRef.current
        ? recorder.uri ?? uriBeforeStop
        : uriBeforeStop;
      if (!uri) {
        setAudioError('components.answers.saveFailed');
        return null;
      }
      const file = new File(uri);
      const metadata = await waitForRecordingFile(() => ({
        exists: file.exists,
        size: file.size,
      }));
      const issue = recordingFileIssue(metadata);
      if (issue) {
        // Never destroy a candidate stopped recording from a heuristic. It may
        // still be a recoverable M4A whose metadata was late on physical iOS.
        console.warn(
          'Audio recording was not finalized',
          JSON.stringify({
            issue,
            fileSize: metadata.size,
            recorderError: recorderErrorRef.current,
          }),
        );
        setAudioError('components.answers.saveFailed');
        return null;
      }
      const draft = await createStoppedRecordingDraft(
        uri,
        () => audioFileDurationSeconds(uri),
        (error) => {
          console.error('Failed to read recorded file duration', error);
          setAudioError('components.answers.durationReadFailed');
        },
      );
      unsavedRecordingUris.current.add(uri);
      updateRecs((current) => [...current, draft]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return draft;
    } catch (error) {
      console.warn(
        'Failed to finalize audio recording',
        error instanceof Error ? error.message : 'unknown error',
      );
      setAudioError('components.answers.saveFailed');
      // Исключение stop не доказывает, что нативный recorder остановился.
      // Не удаляем его URI и оставляем фазу recording для видимого retry.
      throw error;
    } finally {
      // Ошибка native stop не подтверждает остановку. В таком случае сохраняем
      // аудиофокус и оверлей до успешной повторной попытки, чтобы музыка не
      // возобновилась поверх потенциально продолжающейся записи.
      if (nativeStopped) {
        recordingStartedAtRef.current = null;
        recordingOverlayActiveRef.current = false;
        recordingAudioModeLeaseRef.current?.release();
        recordingAudioModeLeaseRef.current = null;
        try {
          await releaseRecordingSession().catch(reportReleaseError);
          await audioModeCoordinator.requestPlayback(setAudioModeAsync, {
            allowsRecording: false,
            playsInSilentMode: true,
          });
        } finally {
          if (!keepAudioBusy) onAudioBusyChange?.(false);
        }
      }
    }
  };

  const stopRecording = (keepAudioBusy = false): Promise<RecordingDraft | null> => {
    // Все конкурирующие вызовы получают одну операцию. Поэтому второй catch
    // не может удалить файл, уже сохранённый первым stop.
    return recordingOperation.runStop((confirm) =>
      performStopRecording(confirm, keepAudioBusy),
    ).catch(() => null);
  };

  const finishLimitedRecording = async (): Promise<boolean> => {
    if (recordingOperation.getPhase() !== 'recording') return true;
    const sheetGeneration = recordingsSheetGenerationRef.current;
    const releaseBusyIfIdle = () => {
      if (
        recordingOperation.getPhase() === 'idle' &&
        activeDraftIdRef.current === null && !limitCueActiveRef.current
      ) onAudioBusyChange?.(false);
    };
    const draft = await stopRecording(true);
    if (!draft) {
      releaseBusyIfIdle();
      return recordingOperation.getPhase() !== 'recording';
    }
    if (
      sheetGeneration !== recordingsSheetGenerationRef.current ||
      !recordingSheetOpenRef.current || !openSheetRef.current
    ) {
      releaseBusyIfIdle();
      return true;
    }
    setAudioError(draft.durationSec === 0
      ? 'components.answers.recordingLimitDurationUnknown'
      : 'components.answers.recordingLimitReached');
    try {
      await Promise.all([
        playLimitCue(),
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      ]);
    } catch (error) {
      console.error('Failed to play recording limit cue', error);
      releaseBusyIfIdle();
    }
    return true;
  };

  // Нативный счётчик нужен только во время записи; итоговую длину берём из файла.
  const getRecordedMillis = useCallback(() => recorder.getStatus().durationMillis, [recorder]);

  const recordingLimit = useRecordingLimit({
    recorder,
    phase: recordingPhase,
    isRecording: () => recordingOperation.getPhase() === 'recording',
    stopAtLimit: finishLimitedRecording,
    stopAfterStatusFailure: async () => {
      const draft = await stopRecording();
      setAudioError(draft
        ? 'components.answers.limitCheckFailed'
        : 'components.answers.saveFailed');
      return recordingOperation.getPhase() !== 'recording';
    },
    canStopManually: () => {
      const startedAt = recordingStartedAtRef.current;
      return !(
        recordingOperation.getPhase() === 'recording' &&
        startedAt !== null &&
        Date.now() - startedAt < MIN_UI_RECORDING_MILLIS
      );
    },
    stopManually: () => stopRecording(),
    reportFailure: (reason, error) => {
      console.error('Recording limit failed', reason, error ?? new Error('Native stop was not confirmed'));
    },
  });

  const togglePlay = (r: RecordingDraft) => {
    if (playingId === r.id) {
      cancelDraftPlayback();
      player.pause();
      setPlayingId(null);
      setPausedId(r.id);
      onAudioBusyChange?.(false);
      return;
    }
    const resume = pausedId === r.id;
    cancelDraftPlayback();
    player.pause();
    setPlayingId(null);
    if (!resume) setPausedId(null);
    setAudioError(null);
    onAudioBusyChange?.(true);
    const generation = draftPlaybackOperation.begin(() =>
      audioModeCoordinator.acquireSession(() => setIsAudioActiveAsync(false)),
    );
    activeDraftIdRef.current = r.id;
    void audioModeCoordinator
      .requestPlayback(setAudioModeAsync, DRAFT_PLAYBACK_MODE)
      .then(async (grant) => {
        const isCurrent = () =>
          draftPlaybackOperation.isCurrent(generation) &&
          recordingSheetOpenRef.current &&
          recsRef.current.some((item) => item.id === r.id && item.uri === r.uri) &&
          !!grant?.isCurrent();
        if (!draftPlaybackOperation.isCurrent(generation)) return;
        if (!recordingSheetOpenRef.current) {
          cancelDraftPlayback();
          return;
        }
        if (!grant?.isCurrent()) {
          cancelDraftPlayback();
          onAudioBusyChange?.(false);
          return;
        }
        if (!(await playAudioRecording(player, r.uri, resume, isCurrent, () => {
          const subscription = player.addListener('playbackStatusUpdate', (status) => {
            if (!draftPlaybackOperation.isCurrent(generation)) return;
            if (!status.didJustFinish && !status.error) return;
            activeDraftIdRef.current = null;
            observeRelease(draftPlaybackOperation.complete(generation));
            setPlayingId(null);
            setPausedId(null);
            if (status.error) setAudioError('components.answers.playbackFailed');
            onAudioBusyChange?.(false);
          });
          draftPlaybackOperation.attachStatus(generation, subscription);
        }))) {
          if (draftPlaybackOperation.isCurrent(generation)) {
            cancelDraftPlayback();
            onAudioBusyChange?.(false);
          }
          return;
        }
        if (!draftPlaybackOperation.isCurrent(generation)) return;
        setPlayingId(r.id);
        setPausedId(null);
      })
      .catch((error) => {
        if (!draftPlaybackOperation.isCurrent(generation)) return;
        console.warn('Failed to play audio recording', error);
        cancelDraftPlayback();
        setPausedId(null);
        setAudioError('components.answers.playbackFailed');
        onAudioBusyChange?.(false);
      });
  };

  const handleRecordingsDismiss = () => {
    if (!nativeAudioMountedRef.current) return;
    recordingsSheetGenerationRef.current += 1;
    const dismissedGeneration = recordingsSheetGenerationRef.current;
    const cueWasActive = limitCueActiveRef.current;
    const cueRelease = cancelLimitCue();
    if (cueWasActive) {
      void cueRelease.then(() => {
        if (
          recordingsSheetGenerationRef.current === dismissedGeneration &&
          recordingOperation.getPhase() === 'idle'
        ) onAudioBusyChange?.(false);
      }).catch(reportReleaseError);
    } else {
      observeRelease(cueRelease);
    }
    const clearDraftAudioBusy = shouldClearDraftAudioBusy(
      activeDraftIdRef.current,
      playingId,
      recordingOperation.getPhase() === 'idle',
    );
    cancelDraftPlayback();
    player.pause();
    if (clearDraftAudioBusy) onAudioBusyChange?.(false);
    setRecordingsSheetOpen(false);
    setPausedId(null);
    recordingSheetOpenRef.current = false;
    // Незавершённый start после следующего await увидит новый token и не
    // сможет включить микрофон за закрытой шторкой.
    recordingOperation.cancelStart();
    setConfirmDeleteId(null);
    if (recordingOperation.getPhase() === 'recording') {
      void stopRecording().then(() => {
        if (recordingOperation.getPhase() !== 'recording') return;
        // Нативный stop не подтвердился: возвращаем управление микрофоном,
        // чтобы запись не осталась скрытой за закрытой шторкой.
        recordingSheetOpenRef.current = true;
        setRecordingsSheetOpen(true);
        recSheetRef.current?.snapToIndex(0);
      });
    }
    if (playingId !== null) {
      setPlayingId(null);
      onAudioBusyChange?.(false);
    }
  };

  const discardUnsavedRecordings = () => {
    for (const uri of unsavedRecordingUris.current) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Отмена ответа не должна ломаться, если iOS уже очистила файл.
      }
    }
    unsavedRecordingUris.current.clear();
  };

  const askOrConfirmDelete = (id: number) => {
    if (confirmDeleteId === id) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmDeleteId(null);
      if (pausedId === id) setPausedId(null);
      if (activeDraftIdRef.current === id) {
        cancelDraftPlayback();
        player.pause();
        setPlayingId(null);
        onAudioBusyChange?.(false);
      }
      pendingTranscriptions.current.get(id)?.controller.abort();
      pendingTranscriptions.current.delete(id);
      const removed = recsRef.current.find((r) => r.id === id);
      if (removed && unsavedRecordingUris.current.delete(removed.uri)) {
        try {
          const file = new File(removed.uri);
          if (file.exists) file.delete();
        } catch {
          // Удаление из списка должно сработать, даже если файл уже недоступен.
        }
      }
      updateRecs((current) => current.filter((r) => r.id !== id));
      return;
    }
    setConfirmDeleteId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  // Повторный вызов во время записи ждёт её, а не пишет второй раз.
  const save = (mode: AnswerSaveMode) => saveFlight.run(() => runSave(mode));

  const runSave = async (mode: AnswerSaveMode) => {
    setSaving(true);
    try {
      // Снимаем фокус до окна согласия: при его закрытии iOS иначе может
      // вернуть клавиатуру уже поверх закрытой шторки ответа.
      answerInputRef.current?.blur();
      Keyboard.dismiss();
      // активная запись не должна молча продолжаться после сохранения
      if (
        recordingOperation.getPhase() === 'recording' ||
        recordingOperation.getPhase() === 'stopping'
      ) {
        await stopRecording();
      }
      await Promise.allSettled(
        [...pendingTranscriptions.current.values()].map((pending) => pending.promise),
      );
      const hasAnswerContext = !!text.trim() || recsRef.current.some((recording) =>
        !!recording.transcript?.trim(),
      );
      const { coreAiConsent, answerContextConsent } = useSettings.getState();
      try {
        await saveAnswerDraft(
          {
            mode,
            hasAnswerContext,
            coreAiConsent,
            answerContextConsent,
            prayerEnded: useSession.getState().remaining === 0,
          },
          () => saveAnswerToStore(answerIndexRef.current, text, recsRef.current),
          () => setAnswerConsentOpen(true),
        );
      } catch (error) {
        // Шторка с черновиком остаётся открытой: ответ не считается сохранённым.
        recordDiagnostic('answer_save_failed', error);
        Alert.alert(t('components.answers.answerSaveFailed'), t('screens.retryMessage'), [
          { text: t('screens.understood') },
        ]);
        return;
      }
      // После сохранения файлы принадлежат ответу и больше не являются черновиком.
      unsavedRecordingUris.current.clear();
      // флаг снимаем до dismiss: событие keyboardDidHide приходит позже close()
      // и слушатель вернул бы шторку на нижнюю точку вместо закрытия
      openSheetRef.current = false;
      Keyboard.dismiss();
      sheetRef.current?.close();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  };

  const decideAnswerConsent = async (decision: 'allowed' | 'denied') => {
    await useSettings.getState().setConsent('answer_context', decision);
    setAnswerConsentOpen(false);
  };

  // «Отмена» с подтверждением: несохранённый контент не выбрасываем молча
  const requestClose = () => {
    if (saveFlight.isActive()) return;
    const hasContent = !!text.trim() || recs.length > 0;
    if (!hasContent || confirmCancel) {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      setConfirmCancel(false);
      abortAllTranscriptions();
      discardUnsavedRecordings();
      openSheetRef.current = false; // см. комментарий в save()
      Keyboard.dismiss();
      sheetRef.current?.close();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // смена подписи на кнопке под фокусом сама не озвучивается
    AccessibilityInfo.announceForAccessibility(t('components.answers.confirmClose'));
    setConfirmCancel(true);
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    cancelTimer.current = setTimeout(() => setConfirmCancel(false), 3000);
  };

  // автосохранение при истечении таймера: черновик не должен пропасть
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      if (!openSheetRef.current && !saveFlight.isActive()) return;
      await save('auto');
    };
    return () => {
      if (flushRef) flushRef.current = null;
    };
  });

  // Пока в шторке есть черновик, жест и тап по фону не должны обходить
  // двухшаговое подтверждение кнопкой «Отмена».
  const hasUnsavedContent = text.length > 0 || recs.length > 0;

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
        pressBehavior={hasUnsavedContent ? 'none' : 'close'}
        // Фон без локализованной подписи; закрывают «Отмена» и жест escape.
        accessible={false}
      />
    ),
    [hasUnsavedContent],
  );

  const renderHandle = useCallback(
    () => (
      <View
        style={styles.handleWrap}
        testID="answer-sheet-handle"
        onStartShouldSetResponder={() => {
          Keyboard.dismiss();
          return false;
        }}
      >
        <View style={styles.handle} />
      </View>
    ),
    [styles],
  );

  const recording = recordingPhase === 'recording' || recordingPhase === 'stopping';

  // Пауза сохраняет позицию и её отображение на той же карточке.
  const playProgress =
    (playingId !== null || pausedId !== null) && playerStatus.duration > 0
      ? Math.min(playerStatus.currentTime / playerStatus.duration, 1)
      : 0;

  const questionText = questions[answerIndexRef.current] ?? questions[qIndex] ?? '';
  const questionHeader = (
    <View style={styles.header}>
      <View style={styles.orbRow}>
        <View style={styles.orb} />
        <Text style={styles.orbLabel}>{t('components.answers.question')}</Text>
      </View>
      <Text ref={questionRef} style={styles.question} testID="answer-question">
        {questionText}
      </Text>
    </View>
  );

  return (
    <>
    <BottomSheet
      key={mountKey}
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      // без этого v5 подмешивает snap-точку «по контенту», и индексы съезжают
      enableDynamicSizing={false}
      // Свайп доступен только для пустой шторки. Иначе закрытие возможно
      // исключительно через «Отмена» → «Точно закрыть?» или «Сохранить».
      enablePanDownToClose={!hasUnsavedContent}
      // Жест содержимого выключен: иначе вертикальное протягивание внутри
      // поля ответа двигает шторку вместо прокрутки текста. Шторку тянут
      // за ручку.
      enableContentPanningGesture={false}
      onChange={async (i) => {
        if (!nativeAudioMountedRef.current) return;
        onIndexChange(i);
        const editing = i >= 0;
        openSheetRef.current = editing;
        if (editing) onOpenChange?.(true);
        if (i < 0) {
          recordingsSheetGenerationRef.current += 1;
          observeRelease(cancelLimitCue());
          cancelDraftPlayback();
          player.pause();
          setPausedId(null);
          // Отменяем start до первого await: запись не сможет включиться уже
          // после начала закрытия родительской шторки.
          recordingSheetOpenRef.current = false;
          setRecordingsSheetOpen(false);
          recordingOperation.cancelStart();
        }
        // Закрыли (свайпом/кнопкой) во время записи — дождаться единого stop.
        if (
          i < 0 &&
          (recordingOperation.getPhase() === 'recording' ||
            recordingOperation.getPhase() === 'stopping')
        ) {
          await stopRecording();
          if (recordingOperation.getPhase() === 'recording') {
            // Если native stop упал, закрытие небезопасно: возвращаем обе
            // шторки и оставляем видимую кнопку повторной остановки.
            openSheetRef.current = true;
            recordingSheetOpenRef.current = true;
            sheetRef.current?.snapToIndex(0);
            recSheetRef.current?.snapToIndex(0);
            return;
          }
        }
        if (i < 0 && playingId !== null) {
          setPlayingId(null);
        }
        if (i < 0) {
          recSheetRef.current?.close();
          abortAllTranscriptions();
          onAudioBusyChange?.(false);
          setConfirmCancel(false);
          discardUnsavedRecordings();
          if (!openSheetRef.current) onOpenChange?.(false);
        }
      }}
      // По умолчанию контейнер контента шторки — единый элемент доступности,
      // и всё внутри скрыто от VoiceOver и от Maestro. Раскрываем детей.
      accessible={false}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      animatedPosition={sheetPosition}
      topInset={insets.top}
      backgroundStyle={styles.sheetBg}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
    >
      {/* В альбомном окне планшета вопрос стоит рядом с формой, оставляя
          полю высоту над клавиатурой. Длинный вопрос прокручивается отдельно. */}
      <Animated.View
        style={[styles.dismissArea, bodyStyle]}
        {...screenReaderHiddenProps(!open || recordingsSheetOpen)}
        // «Z» VoiceOver — та же «Отмена» с подтверждением черновика
        onAccessibilityEscape={requestClose}
        // Боковые поля шторки тоже закрывают клавиатуру, не перехватывая ввод.
        onStartShouldSetResponder={() => {
          if (keyboardOpen) Keyboard.dismiss();
          return false;
        }}
      >
        <View style={[styles.content, landscapeTablet && styles.contentLandscape]}>
          {landscapeTablet ? (
            <BottomSheetScrollView
              style={styles.questionColumn}
              contentContainerStyle={styles.questionColumnContent}
              keyboardShouldPersistTaps="handled"
            >
              {questionHeader}
            </BottomSheetScrollView>
          ) : questionHeader}

          <View style={styles.form}>
            {/* Поле занимает всю оставшуюся высоту и прокручивается само:
                курсор при наборе всегда остаётся в поле зрения. */}
            <BottomSheetTextInput
              ref={answerInputRef}
              testID="answer-input"
              value={text}
              onChangeText={setText}
              multiline
              placeholder={t('components.answers.placeholder')}
              placeholderTextColor={colors.placeholder}
              accessibilityLabel={t('components.answers.placeholder')}
              style={styles.input}
            />

            {!keyboardOpen && !text && recs.length === 0 && <Text style={styles.voiceHint}>{t('components.answers.voiceHint')}</Text>}

            <View style={styles.actionsRow}>
              {/* микрофон — квадрат в одном ряду с кнопками, как навигация у
                  карточки-спутника. Бадж показывает, сколько записей уже есть:
                  сами они живут в отдельной шторке и из ответа не видны. */}
              <Pressable
                accessibilityLabel={
                  recs.length ? t('components.answers.voiceCount', { count: recs.length }) : t('components.answers.recordAudio')
                }
                accessibilityRole="button"
                testID="answer-record-button"
                hitSlop={touchSlop(sc(32))} // micBtn
                onPress={openRecordings}
                style={({ pressed }) => [styles.micBtn, pressed && { transform: [{ scale: 0.97 }] }]}
              >
                <Mic color={colors.greenSoft} />
                {recs.length > 0 && (
                  <View style={styles.micBadge} testID="answer-record-badge">
                    <Text style={styles.micBadgeText}>{recs.length}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={touchSlop(sc(32))} // cancelBtn
                onPress={requestClose}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  confirmCancel && styles.cancelBtnConfirming,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text style={[styles.cancelLabel, confirmCancel && { color: '#ec9b8e' }]}>
                  {confirmCancel ? t('components.answers.confirmClose') : t('components.answers.cancel')}
                </Text>
              </Pressable>
              <GoldButton
                compact
                label={saving ? t('components.answers.saving') : t('components.answers.save')}
                onPress={() => void save('manual')}
                style={{ flex: 1 }}
                testID="answer-save-button"
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </BottomSheet>

    <RecordingsSheet
      sheetRef={recSheetRef}
      visible={recordingsSheetOpen}
      recordings={recs}
      recording={recording}
      recordingPhase={recordingPhase}
      {...recordingLimit.overlayProps}
      getRecordedMillis={getRecordedMillis}
      playingId={playingId}
      pausedId={pausedId}
      playProgress={playProgress}
      audioError={audioError ? t(audioError, { limit: limitLabel }) : null}
      confirmDeleteId={confirmDeleteId}
      expandedTranscripts={expandedTranscripts}
      onStartRecording={startRecording}
      onTogglePlay={togglePlay}
      onDelete={askOrConfirmDelete}
      onTranscribe={(recording) => void startTranscription(recording)}
      onToggleTranscript={toggleTranscript}
      onAppendToAnswer={appendTranscriptToAnswer}
      onDismiss={handleRecordingsDismiss}
    />
    <PrivacyConsentDialog
      visible={answerConsentOpen}
      purpose="answer_context"
      onDismiss={() => setAnswerConsentOpen(false)}
      onDecision={decideAnswerConsent}
    />
    <PrivacyConsentDialog
      visible={audioConsentOpen}
      purpose="audio_transcription"
      onDismiss={() => {
        pendingConsentRecording.current = null;
        setAudioConsentOpen(false);
      }}
      onDecision={decideAudioConsent}
    />
    </>
  );
}

const stylesFactory = () => StyleSheet.create({
  sheetBg: {
    backgroundColor: '#1d1710',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white08,
  },
  // высота ручки задана явно: от неё считается высота тела шторки
  handleWrap: {
    height: sc(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,.13)',
    width: sc(36),
    height: sc(4),
    borderRadius: sc(2),
  },
  dismissArea: { width: '100%' },
  // ADR-0012: колонка держит меру строки. Без неё на планшете строка ответа
  // уходила на ~70 символов, а «Сохранить» растягивалась во всю ширину окна.
  content: {
    flex: 1,
    ...column(),
    paddingHorizontal: sc(16),
    paddingBottom: sc(16),
  },
  contentLandscape: {
    maxWidth: 1120,
    flexDirection: 'row',
    gap: sc(24),
    paddingHorizontal: sc(24),
  },
  questionColumn: {
    width: sc(210),
    flexGrow: 0,
    flexShrink: 0,
  },
  questionColumnContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  form: {
    flex: 1,
    minWidth: 0,
  },
  // Шапка не сжимается скроллом: вопрос — контекст ответа и должен быть виден.
  // flexShrink на крайний случай очень длинного вопроса на низком экране.
  header: {
    flexShrink: 1,
  },
  orbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(4),
    marginBottom: sc(8),
  },
  orb: {
    width: sc(9),
    height: sc(9),
    borderRadius: sc(5),
    backgroundColor: '#6fae93',
  },
  orbLabel: {
    fontFamily: fonts.mono,
    fontSize: sc(9),
    letterSpacing: sc(1.4),
    color: 'rgba(170,210,190,.65)',
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: sc(16),
    lineHeight: sc(22),
    color: colors.cream,
    textAlign: 'center',
    marginBottom: sc(12),
  },
  input: {
    // Всё тело шторки минус вопрос и кнопки. Длинный ответ прокручивается
    // внутри поля, поэтому коробка не растёт и ничего не выталкивает.
    flex: 1,
    padding: sc(12),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
    color: colors.parchment,
    fontSize: sc(15),
    lineHeight: sc(23),
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  voiceHint: {
    marginTop: sc(8),
    fontFamily: fonts.serifItalic,
    fontSize: sc(12),
    textAlign: 'center',
    color: colors.creamDim,
  },
  micBtn: {
    width: sc(32),
    height: sc(32),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(127,174,154,.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,174,154,.28)',
  },
  actionDisabled: { opacity: 0.4 },
  // Счётчик записей сидит на углу микрофона: сами карточки видны только
  // в шторке записей, и без баджа непонятно, что там уже что-то есть.
  micBadge: {
    position: 'absolute',
    top: -sc(6),
    right: -sc(6),
    minWidth: sc(16),
    height: sc(16),
    paddingHorizontal: sc(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: sc(8),
    backgroundColor: colors.amber,
  },
  micBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(10),
    lineHeight: sc(12),
    color: '#1d1710',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginTop: sc(14),
  },
  cancelBtn: {
    // высота как у кнопок карточки-спутника (CompanionDock/cardBtnSize)
    paddingHorizontal: sc(14),
    height: sc(32),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.09)',
  },
  cancelBtnConfirming: {
    backgroundColor: 'rgba(220,90,70,.18)',
    borderColor: 'rgba(220,90,70,.45)',
  },
  cancelLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(12),
    color: colors.creamDim,
  },
});
