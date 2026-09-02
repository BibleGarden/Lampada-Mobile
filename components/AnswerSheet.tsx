import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useSession, RecordingDraft } from '../lib/store';
import { transcribeRecording } from '../lib/transcription';
import { recordingFileIssue } from '../lib/recordingFile';
import {
  createRecordingOperation,
  recoverRecordingAfterMediaServicesReset,
} from '../lib/recordingOperation';
import {
  audioModeCoordinator,
  type RecordingAudioModeLease,
} from '../lib/audioModeCoordinator';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';
import { useSheetReflow } from '../lib/useSheetReflow';
import { screenReaderHiddenProps } from '../lib/a11y';
import { Mic } from './icons';
import RecordingsSheet from './RecordingsSheet';
import { GoldButton } from './ui';

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
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
  /** Таймер не завершает молитву, пока человек отвечает в открытой шторке. */
  onEditingChange?: (editing: boolean) => void;
  /** После нуля ответ завершается только явной кнопкой или подтверждённой отменой. */
  timeExpired?: boolean;
  /** Музыка сессии уступает аудиофокус записи и прослушиванию черновика. */
  onAudioBusyChange?: (busy: boolean) => void;
};

const HANDLE_HEIGHT = sc(22);
const MIN_UI_RECORDING_MILLIS = 1_500;

// Шторка ответа: текст ответа и счётчик голосовых записей. Сами записи живут
// в отдельной шторке поверх (RecordingsSheet). Открывается на текущем вопросе,
// черновик считывается из сохранённого ответа.
export default function AnswerSheet({
  sheetRef,
  openRef,
  flushRef,
  onEditingChange,
  timeExpired = false,
  onAudioBusyChange,
}: Props) {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  // подписка только на нужное — не ререндерим шторку от тика таймера
  const questions = useSession((st) => st.questions);
  const qIndex = useSession((st) => st.qIndex);
  const saveAnswerToStore = useSession((st) => st.saveAnswer);
  const [text, setText] = useState('');
  const [recs, setRecs] = useState<RecordingDraft[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Расшифровка показывается свёрнутой — три строки; раскрытая читается целиком.
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<number, boolean>>({});
  const [recordingsSheetOpen, setRecordingsSheetOpen] = useState(false);
  const recSheetRef = useRef<BottomSheet | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [recordingPhase, setRecordingPhase] = useState<
    'idle' | 'starting' | 'recording' | 'stopping'
  >('idle');
  const [saving, setSaving] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSheetRef = useRef(false); // фактическое состояние шторки (для слушателей клавиатуры)
  const savingRef = useRef(false);
  const recsRef = useRef<RecordingDraft[]>([]);
  const pendingTranscriptions = useRef(
    new Map<number, { controller: AbortController; promise: Promise<void> }>(),
  );
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
  const recordingAudioModeLeaseRef = useRef<RecordingAudioModeLease | null>(null);
  const recordingSheetOpenRef = useRef(false);
  // Нативный recorderState обновляется с задержкой и не подходит как mutex.
  // Pure coordinator синхронно держит фазу, state только отражает её в UI.
  const recordingOperationRef = useRef<ReturnType<typeof createRecordingOperation> | null>(null);
  if (!recordingOperationRef.current) {
    recordingOperationRef.current = createRecordingOperation(setRecordingPhase);
  }
  const recordingOperation = recordingOperationRef.current;

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    if (status.mediaServicesDidReset) {
      const lease = recordingAudioModeLeaseRef.current;
      if (recordingOperation.getPhase() === 'idle' && !lease) return;
      recorderErrorRef.current = status.error || 'Audio recorder was interrupted';
      recordingStartedAtRef.current = null;
      recordingOverlayActiveRef.current = false;
      recoverRecordingAfterMediaServicesReset(recordingOperation, lease);
      if (recordingAudioModeLeaseRef.current === lease) {
        recordingAudioModeLeaseRef.current = null;
      }
      setAudioError('Запись прервалась — попробуй ещё раз');
      onAudioBusyChange?.(false);
      void audioModeCoordinator
        .requestPlayback(setAudioModeAsync, {
          allowsRecording: false,
          playsInSilentMode: true,
        })
        .catch((error) => console.warn('Не удалось восстановить аудиорежим', error));
      return;
    }
    if (status.hasError) {
      recorderErrorRef.current = status.error || 'Audio recorder was interrupted';
      recordingOverlayActiveRef.current = false;
      setAudioError('Запись прервалась — попробуй ещё раз');
      onAudioBusyChange?.(false);
    }
  });
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  // вторая точка — для открытой клавиатуры и для контента, который перестал
  // помещаться: keyboardBehavior="extend" поднимает шторку до верхней, и поле
  // ввода с кнопками остаются видны. Верхняя точка — вся высота под
  // статус-баром (topInset).
  const { mountKey, onIndexChange } = useSheetReflow();
  const snapPoints = useMemo(() => ['62%', '100%'], []);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // Контейнер контента у шторки всегда высотой в верхнюю точку, а ручка
  // абсолютная — flex по ним не посчитать. Поэтому высоту тела считаем сами:
  // видимая часть шторки = высота окна минус её позиция.
  const windowHeight = useWindowDimensions().height;
  const sheetPosition = useSharedValue(windowHeight);
  const keyboardHeight = useSharedValue(0);
  const bodyStyle = useAnimatedStyle(() => ({
    height: Math.max(
      0,
      windowHeight - sheetPosition.value - HANDLE_HEIGHT - keyboardHeight.value,
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

  const startTranscription = useCallback(
    (recording: RecordingDraft) => {
      if (savingRef.current) return;
      pendingTranscriptions.current.get(recording.id)?.controller.abort();
      const controller = new AbortController();
      updateRecs((current) =>
        current.map((item) =>
          item.id === recording.id ? { ...item, transcriptState: 'loading' } : item,
        ),
      );

      const promise = transcribeRecording(recording.uri, recording.durationSec, controller.signal)
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
            'Не удалось расшифровать аудиозапись',
            error instanceof Error ? error.message : 'unknown error',
          );
          updateRecs((current) =>
            current.map((item) =>
              item.id === recording.id ? { ...item, transcriptState: 'error' } : item,
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
    [updateRecs, sheetRef],
  );

  // Убрать расшифровку: карточка возвращается к одной строке, а кнопка
  // «Расшифровать» — на место. Сама запись остаётся.
  const removeTranscript = useCallback(
    (id: number) => {
      pendingTranscriptions.current.get(id)?.controller.abort();
      pendingTranscriptions.current.delete(id);
      updateRecs((current) =>
        current.map((item) =>
          item.id === id ? { ...item, transcript: null, transcriptState: 'idle' } : item,
        ),
      );
      setExpandedTranscripts((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
    },
    [updateRecs],
  );

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
    setAudioError(null);
    recorderErrorRef.current = null;
    onEditingChange?.(true);
    sheetRef.current?.snapToIndex(0);
  }, [abortAllTranscriptions, sheetRef, onEditingChange]);

  useEffect(() => {
    openRef.current = handleOpen;
    return () => {
      openRef.current = null;
    };
  }, [openRef, handleOpen]);

  useEffect(
    () => () => {
      recordingSheetOpenRef.current = false;
      recordingOperation.cancelStart();
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      abortAllTranscriptions();
      const phase = recordingOperation.getPhase();
      if (phase === 'recording') {
        // Hard navigation can unmount the sheet without onChange(-1). Stop the
        // owned recorder explicitly; after unmount its native object is disposed,
        // so the process-wide lease must not leak into the next Session.
        void recorder
          .stop()
          .catch((error) => console.warn('Не удалось остановить запись при выходе', error))
          .finally(() => {
            recordingAudioModeLeaseRef.current?.release();
            recordingAudioModeLeaseRef.current = null;
            onAudioBusyChange?.(false);
          });
      } else if (phase === 'stopping') {
        // The in-flight stop owns the native call. After hard unmount the hook
        // disposes its recorder, so release the singleton lease on either
        // settlement path; otherwise a rejected stop poisons the next Session.
        const pendingStop = recordingOperation.getPendingStop();
        const releaseAfterUnmount = () => {
          recordingAudioModeLeaseRef.current?.release();
          recordingAudioModeLeaseRef.current = null;
          onAudioBusyChange?.(false);
        };
        if (pendingStop) {
          void pendingStop.then(releaseAfterUnmount, releaseAfterUnmount);
        } else {
          releaseAfterUnmount();
        }
      } else {
        onAudioBusyChange?.(false);
      }
    },
    [abortAllTranscriptions, onAudioBusyChange, recorder, recordingOperation],
  );

  // конец воспроизведения — вернуть иконку play
  useEffect(() => {
    if (playerStatus.error) {
      setPlayingId(null);
      setAudioError('Не удалось воспроизвести запись');
      onAudioBusyChange?.(false);
      return;
    }
    if (playerStatus.didJustFinish) {
      setPlayingId(null);
      onAudioBusyChange?.(false);
    }
  }, [playerStatus.didJustFinish, playerStatus.error, onAudioBusyChange]);

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
    // Оверлей записи не должен остаться под открытой клавиатурой.
    Keyboard.dismiss();
    // Сначала синхронно останавливаем музыку/черновик, затем меняем глобальный
    // audio mode: иначе музыка может попасть в начало голосовой записи.
    player.pause();
    setPlayingId(null);
    onAudioBusyChange?.(true);
    recorderErrorRef.current = null;
    setAudioError(null);
    let audioModeEnabled = false;
    let prepared = false;
    let started = false;
    let nativeStopConfirmed = false;
    let nativeCleanupUncertain = false;
    let audioModeLease: RecordingAudioModeLease | null = null;
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
      attempt.isCurrent() && recordingSheetOpenRef.current;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      if (!startIsCurrent()) return;
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
        // Android не разрешает повторный prepare, пока предыдущий MediaRecorder
        // не reset. stop() после prepare освобождает его даже без record().
        await recorder.stop();
        nativeStopConfirmed = true;
        discardPreparedFile();
        return;
      }
      recorder.record();
      if (!recorder.isRecording) {
        // AVAudioRecorder can sporadically refuse an immediate second start
        // while expo-audio still advances its JS state/timer. Re-prepare once
        // and verify the native flag instead of saving a header-only M4A.
        const failedUri = recorder.uri;
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
        if (failedUri) {
          try {
            const failedFile = new File(failedUri);
            if (failedFile.exists) failedFile.delete();
          } catch {
            // Retry correctness does not depend on best-effort orphan cleanup.
          }
        }
        recorder.record();
        if (!recorder.isRecording) {
          throw new Error('Native audio recorder did not enter recording state');
        }
      }
      recordingStartedAtRef.current = Date.now();
      // Шторку могли программно закрыть между последним await и record().
      // Тогда немедленно гасим нативную запись и не создаём черновик.
      if (!startIsCurrent()) {
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
      started = attempt.commit();
      if (!started) return;
      recordingOverlayActiveRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.warn(
        'Не удалось начать аудиозапись',
        error instanceof Error ? error.message : 'unknown error',
      );
      setAudioError('Не удалось начать запись — попробуй ещё раз');
    } finally {
      // После успешного старта режим вернёт stopRecording. Во всех остальных
      // исходах (отказ, ошибка, dismiss) восстанавливаем его здесь.
      if (!started) {
        // Ошибка могла случиться после успешного prepare, но до record().
        // Освобождаем подготовленный Android-recorder для следующей попытки.
        if (prepared && !nativeStopConfirmed) {
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
        if (nativeCleanupUncertain && attempt.recoverAsRecording()) {
          // Не возвращаем idle при неизвестном нативном состоянии. Показываем
          // управление stop снова и удерживаем recording lease/audio busy.
          started = true;
          recordingSheetOpenRef.current = true;
          recordingOverlayActiveRef.current = true;
          recSheetRef.current?.snapToIndex(0);
          setAudioError('Не удалось отменить запись — нажми «Готово» ещё раз');
        }
        if (audioModeEnabled) {
          if (!prepared || nativeStopConfirmed) {
            audioModeLease?.release();
            if (recordingAudioModeLeaseRef.current === audioModeLease) {
              recordingAudioModeLeaseRef.current = null;
            }
            await audioModeCoordinator
              .requestPlayback(setAudioModeAsync, {
                allowsRecording: false,
                playsInSilentMode: true,
              })
              .catch((modeError) =>
                console.warn('Не удалось восстановить аудиорежим', modeError),
              );
          }
        }
        if (!started) onAudioBusyChange?.(false);
      }
      // Новому start нельзя вклиниться раньше, чем старый вернул audio mode.
      attempt.finish();
    }
  };

  // Микрофон в шторке ответа ведёт в записи. Пустой список — сразу пишем:
  // человек нажал микрофон, чтобы говорить, а не чтобы смотреть на пустоту.
  const openRecordings = () => {
    Keyboard.dismiss();
    setConfirmDeleteId(null);
    setRecordingsSheetOpen(true);
    recordingSheetOpenRef.current = true;
    recSheetRef.current?.snapToIndex(0);
    if (recsRef.current.length === 0) void startRecording();
  };

  const performStopRecording = async (
    confirmNativeStop: () => void,
  ): Promise<RecordingDraft | null> => {
    // длительность читаем до stop(): recorderState обновляется раз в 500 мс и занижает
    const durationMillis = recorder.getStatus().durationMillis ?? 0;
    let nativeStopped = false;
    try {
      await recorder.stop();
      nativeStopped = true;
      confirmNativeStop();
      const uri = recorder.uri;
      if (!uri) {
        setAudioError('Запись не сохранилась — попробуй ещё раз');
        return null;
      }
      const file = new File(uri);
      const issue = recorderErrorRef.current
        ? 'incomplete'
        : recordingFileIssue(file, durationMillis);
      if (issue) {
        const fileSize = file.size;
        if (file.exists) file.delete();
        console.warn(
          'Аудиозапись не была завершена',
          JSON.stringify({
            issue,
            durationMillis,
            fileSize,
            recorderError: recorderErrorRef.current,
          }),
        );
        setAudioError('Запись не сохранилась — попробуй ещё раз');
        return null;
      }
      const draft: RecordingDraft = {
        id: Date.now(),
        uri,
        durationSec: Math.max(1, Math.round(durationMillis / 1000)),
        transcript: null,
        transcriptState: 'idle',
      };
      unsavedRecordingUris.current.add(uri);
      updateRecs((current) => [...current, draft]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return draft;
    } catch (error) {
      console.warn(
        'Не удалось завершить аудиозапись',
        error instanceof Error ? error.message : 'unknown error',
      );
      setAudioError('Запись не сохранилась — попробуй ещё раз');
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
        await audioModeCoordinator
          .requestPlayback(setAudioModeAsync, {
            allowsRecording: false,
            playsInSilentMode: true,
          })
          .catch((error) => console.warn('Не удалось восстановить аудиорежим', error));
        onAudioBusyChange?.(false);
      }
    }
  };

  const stopRecording = (): Promise<RecordingDraft | null> => {
    // Все конкурирующие вызовы получают одну операцию. Поэтому второй catch
    // не может удалить файл, уже сохранённый первым stop.
    return recordingOperation.runStop(performStopRecording).catch(() => null);
  };

  const stopRecordingFromUi = (): Promise<RecordingDraft | null> => {
    const startedAt = recordingStartedAtRef.current;
    if (
      recordingOperation.getPhase() === 'recording' &&
      startedAt !== null &&
      Date.now() - startedAt < MIN_UI_RECORDING_MILLIS
    ) {
      return Promise.resolve(null);
    }
    return stopRecording();
  };

  const togglePlay = (r: RecordingDraft) => {
    if (playingId === r.id) {
      player.pause();
      setPlayingId(null);
      onAudioBusyChange?.(false);
      return;
    }
    onAudioBusyChange?.(true);
    player.replace(r.uri);
    player.play();
    setPlayingId(r.id);
  };

  const handleRecordingsDismiss = () => {
    setRecordingsSheetOpen(false);
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
      player.pause();
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
      if (playingId === id) {
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

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
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
      saveAnswerToStore(answerIndexRef.current, text, recsRef.current);
      // После сохранения файлы принадлежат ответу и больше не являются черновиком.
      unsavedRecordingUris.current.clear();
      // флаг снимаем до dismiss: событие keyboardDidHide приходит позже close()
      // и слушатель вернул бы шторку на нижнюю точку вместо закрытия
      openSheetRef.current = false;
      Keyboard.dismiss();
      sheetRef.current?.close();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // «Отмена» с подтверждением: несохранённый контент не выбрасываем молча
  const requestClose = () => {
    if (savingRef.current) return;
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
    setConfirmCancel(true);
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    cancelTimer.current = setTimeout(() => setConfirmCancel(false), 3000);
  };

  // автосохранение при истечении таймера: черновик не должен пропасть
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      if (!openSheetRef.current) return;
      await save();
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
        pressBehavior={hasUnsavedContent || timeExpired ? 'none' : 'close'}
      />
    ),
    [hasUnsavedContent, timeExpired],
  );

  const renderHandle = useCallback(
    () => (
      <View style={styles.handleWrap}>
        <View style={styles.handle} />
      </View>
    ),
    [styles],
  );

  const recording = recordingPhase === 'recording' || recordingPhase === 'stopping';

  // прогресс воспроизведения активной записи (0..1)
  const playProgress =
    playingId !== null && playerStatus.duration > 0
      ? Math.min(playerStatus.currentTime / playerStatus.duration, 1)
      : 0;

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
      enablePanDownToClose={!timeExpired && !hasUnsavedContent}
      // Жест содержимого выключен: иначе вертикальное протягивание внутри
      // поля ответа двигает шторку вместо прокрутки текста. Шторку тянут
      // за ручку.
      enableContentPanningGesture={false}
      onChange={async (i) => {
        onIndexChange(i);
        const editing = i >= 0;
        openSheetRef.current = editing;
        onEditingChange?.(editing);
        if (i < 0) {
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
          player.pause();
          setPlayingId(null);
        }
        if (i < 0) {
          recSheetRef.current?.close();
          abortAllTranscriptions();
          onAudioBusyChange?.(false);
          setConfirmCancel(false);
          discardUnsavedRecordings();
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
      {/* Тело: вопрос сверху, поле ответа во всю оставшуюся высоту, кнопки
          снизу. Список записей уехал в отдельную шторку, поэтому делить высоту
          между полем и карточками больше не нужно и тело не прокручивается. */}
      <Animated.View
        style={[styles.content, bodyStyle]}
        {...screenReaderHiddenProps(recordingsSheetOpen)}
        // тап по пустому месту тела убирает клавиатуру
        onStartShouldSetResponder={() => {
          if (keyboardOpen) Keyboard.dismiss();
          return false;
        }}
      >
        <View style={styles.header}>
          <View style={styles.orbRow}>
            <View style={styles.orb} />
            <Text style={styles.orbLabel}>СПУТНИК СПРОСИЛ</Text>
          </View>
          <Text style={styles.question} testID="answer-question">
            {questions[answerIndexRef.current] ?? questions[qIndex]}
          </Text>
        </View>

        {/* Поле занимает всю оставшуюся высоту и прокручивается само:
            курсор при наборе всегда остаётся в поле зрения. */}
        <BottomSheetTextInput
          testID="answer-input"
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Запиши, что откликается…"
          placeholderTextColor="rgba(240,230,210,.35)"
          style={styles.input}
        />

        {!text && recs.length === 0 && <Text style={styles.voiceHint}>или ответь голосом</Text>}

        <View style={styles.actionsRow}>
          {/* микрофон — квадрат в одном ряду с кнопками, как навигация у
              карточки-спутника. Бадж показывает, сколько записей уже есть:
              сами они живут в отдельной шторке и из ответа не видны. */}
          <Pressable
            accessibilityLabel={
              recs.length ? `Голосовые записи, ${recs.length}` : 'Записать аудио'
            }
            accessibilityRole="button"
            testID="answer-record-button"
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
            onPress={requestClose}
            style={({ pressed }) => [
              styles.cancelBtn,
              confirmCancel && styles.cancelBtnConfirming,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Text style={[styles.cancelLabel, confirmCancel && { color: '#ec9b8e' }]}>
              {confirmCancel ? 'Точно закрыть?' : 'Отмена'}
            </Text>
          </Pressable>
          <GoldButton
            compact
            label={saving ? 'Сохраняю…' : timeExpired ? 'Сохранить и завершить' : 'Сохранить'}
            onPress={save}
            style={{ flex: 1 }}
            testID="answer-save-button"
          />
        </View>
      </Animated.View>
    </BottomSheet>

    <RecordingsSheet
      sheetRef={recSheetRef}
      visible={recordingsSheetOpen}
      recordings={recs}
      recording={recording}
      recordingPhase={recordingPhase}
      playingId={playingId}
      playProgress={playProgress}
      audioError={audioError}
      confirmDeleteId={confirmDeleteId}
      expandedTranscripts={expandedTranscripts}
      onStartRecording={startRecording}
      onStopRecording={stopRecordingFromUi}
      onTogglePlay={togglePlay}
      onDelete={askOrConfirmDelete}
      onTranscribe={startTranscription}
      onRemoveTranscript={removeTranscript}
      onToggleTranscript={toggleTranscript}
      onAppendToAnswer={appendTranscriptToAnswer}
      onDismiss={handleRecordingsDismiss}
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
    height: HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,.13)',
    width: sc(36),
    height: sc(4),
    borderRadius: sc(2),
  },
  // ADR-0012: колонка держит меру строки. Без неё на планшете строка ответа
  // уходила на ~70 символов, а «Сохранить» растягивалась во всю ширину окна.
  content: {
    ...column(),
    paddingHorizontal: sc(16),
    paddingBottom: sc(16),
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
    color: 'rgba(240,225,195,.4)',
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
