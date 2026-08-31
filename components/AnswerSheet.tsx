import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  type TextInputContentSizeChangeEventData,
  useWindowDimensions,
  View,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
  useAudioRecorderState,
} from 'expo-audio';
import { useSession, RecordingDraft, fmtTime } from '../lib/store';
import { transcribeRecording } from '../lib/transcription';
import { recordingFileIssue } from '../lib/recordingFile';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';
import { useSheetReflow } from '../lib/useSheetReflow';
import { Close, Mic, PlayIcon, PauseIcon, Regen, TextLines, Trash } from './icons';
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
// Минимум поля ответа — примерно четыре строки. Пока контент помещается,
// поле дотягивается до низа списка (flexGrow), дальше растёт под текст.
const ANSWER_MIN_HEIGHT = () => sc(96);
const TRANSCRIPT_MIN_HEIGHT = () => sc(54);

// Шторка ответа: текст + голосовые записи. Открывается на текущем вопросе,
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
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
  // Край-подсказка «список продолжается». Геометрию считаем на UI-потоке:
  // высоту тела задаёт анимированная позиция шторки, и onLayout у детей после
  // её изменения не приходит — замер обычным layout-событием врал бы.
  const [overflowing, setOverflowing] = useState(false);
  const headerHeight = useSharedValue(0);
  const actionsHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    if (status.hasError || status.mediaServicesDidReset) {
      recorderErrorRef.current = status.error || 'Audio recorder was interrupted';
      recordingOverlayActiveRef.current = false;
      setAudioError('Запись прервалась — попробуй ещё раз');
      onAudioBusyChange?.(false);
    }
  });
  const recorderState = useAudioRecorderState(recorder);
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

  // Тело минус закреплённые шапка и панель кнопок = видимая высота списка.
  useAnimatedReaction(
    () => {
      const body = Math.max(
        0,
        windowHeight - sheetPosition.value - HANDLE_HEIGHT - keyboardHeight.value,
      );
      const viewport = body - headerHeight.value - actionsHeight.value;
      return viewport > 0 && contentHeight.value > viewport + 1;
    },
    (cut, previous) => {
      if (cut !== previous) runOnJS(setOverflowing)(cut);
    },
  );

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
          // Расшифровка — крупный новый блок под своей записью. Раскрываем
          // шторку, иначе результат появляется ниже видимой части списка.
          sheetRef.current?.snapToIndex(1);
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
    },
    [updateRecs],
  );

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
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      abortAllTranscriptions();
      onAudioBusyChange?.(false);
    },
    [abortAllTranscriptions, onAudioBusyChange],
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
    // Оверлей записи не должен остаться под открытой клавиатурой.
    Keyboard.dismiss();
    // Сначала синхронно останавливаем музыку/черновик, затем меняем глобальный
    // audio mode: иначе музыка может попасть в начало голосовой записи.
    player.pause();
    setPlayingId(null);
    onAudioBusyChange?.(true);
    recorderErrorRef.current = null;
    setAudioError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onAudioBusyChange?.(false);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      // пресет обязателен: без options рекордер переиспользует один URL
      // и каждая новая запись затирает файл предыдущей
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record();
      recordingOverlayActiveRef.current = true;
      // Оверлей измеряется по максимальной высоте BottomSheet: на нижнем
      // snap-point его stop-контрол попадает за область клипа.
      sheetRef.current?.snapToIndex(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.warn(
        'Не удалось начать аудиозапись',
        error instanceof Error ? error.message : 'unknown error',
      );
      setAudioError('Не удалось начать запись — попробуй ещё раз');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
        (modeError) => console.warn('Не удалось восстановить аудиорежим', modeError),
      );
      onAudioBusyChange?.(false);
    }
  };

  const stopRecording = async (): Promise<RecordingDraft | null> => {
    // длительность читаем до stop(): recorderState обновляется раз в 500 мс и занижает
    const durationMillis = recorder.getStatus().durationMillis ?? 0;
    try {
      await recorder.stop();
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
        if (file.exists) file.delete();
        console.warn('Аудиозапись не была завершена', recorderErrorRef.current ?? issue);
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
      const failedUri = recorder.uri;
      if (failedUri) {
        try {
          const failedFile = new File(failedUri);
          if (failedFile.exists) failedFile.delete();
        } catch {
          // Ошибка очистки не должна скрывать исходную ошибку рекордера.
        }
      }
      console.warn(
        'Не удалось завершить аудиозапись',
        error instanceof Error ? error.message : 'unknown error',
      );
      setAudioError('Запись не сохранилась — попробуй ещё раз');
      return null;
    } finally {
      recordingOverlayActiveRef.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
        (error) => console.warn('Не удалось восстановить аудиорежим', error),
      );
      onAudioBusyChange?.(false);
    }
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
      if (recorderState.isRecording) {
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

  const recording = recorderState.isRecording;

  // прогресс воспроизведения активной записи (0..1)
  const playProgress =
    playingId !== null && playerStatus.duration > 0
      ? Math.min(playerStatus.currentTime / playerStatus.duration, 1)
      : 0;

  return (
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
      // Ключевое для раскладки: пока жест содержимого включён, библиотека
      // разблокирует внутренний скролл только на верхней точке — на 62%
      // список записей был обрезан и недостижим. Выключаем — список
      // прокручивается на любой точке, а саму шторку тянут за ручку.
      enableContentPanningGesture={false}
      onChange={async (i) => {
        onIndexChange(i);
        const editing = i >= 0;
        openSheetRef.current = editing;
        onEditingChange?.(editing);
        // закрыли (свайпом/кнопкой) во время записи — остановить микрофон
        if (i < 0 && recorder.isRecording) await stopRecording();
        if (i < 0 && playingId !== null) {
          player.pause();
          setPlayingId(null);
        }
        if (i < 0) {
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
      {/* Тело: закреплены только вопрос сверху и кнопки снизу. Всё между ними —
          один скролл. Раньше поле ответа, список записей и вопрос делили
          фиксированную высоту, поле забирало всё свободное место и не отдавало
          обратно, а список срезало по живому — теперь ничто не обрезается. */}
      <Animated.View
        style={[styles.content, bodyStyle]}
        // тап по пустому месту шапки и панели кнопок убирает клавиатуру
        onStartShouldSetResponder={() => {
          if (keyboardOpen) Keyboard.dismiss();
          return false;
        }}
      >
        <View
          style={styles.header}
          onLayout={(e) => {
            headerHeight.value = e.nativeEvent.layout.height;
          }}
        >
          <View style={styles.orbRow}>
            <View style={styles.orb} />
            <Text style={styles.orbLabel}>СПУТНИК СПРОСИЛ</Text>
          </View>
          <Text style={styles.question} testID="answer-question">
            {questions[answerIndexRef.current] ?? questions[qIndex]}
          </Text>
        </View>

        <View style={styles.scroll}>
        <BottomSheetScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_w, h) => {
            contentHeight.value = h;
          }}
        >
          {/* Пока контент помещается, поле дотягивается до низа (flexGrow) и
              шторка выглядит как раньше; дальше растёт под текст, а лишнее
              берёт на себя скролл тела. */}
          <AutoGrowInput
            testID="answer-input"
            value={text}
            onChangeText={setText}
            placeholder="Запиши, что откликается…"
            placeholderTextColor="rgba(240,230,210,.35)"
            minHeight={ANSWER_MIN_HEIGHT()}
            style={styles.input}
          />

          {!text && recs.length === 0 && (
            <Text style={styles.voiceHint}>или ответь голосом</Text>
          )}

          {!!audioError && <Text style={styles.audioError}>{audioError}</Text>}

          {recs.map((r, i) => {
            const playing = playingId === r.id;
            const loading = r.transcriptState === 'loading';
            return (
              <View key={r.id} style={styles.recCard}>
                <View style={styles.recRow}>
                  <Pressable
                    accessibilityLabel={playing ? `Пауза, запись ${i + 1}` : `Прослушать запись ${i + 1}`}
                    accessibilityRole="button"
                    onPress={() => togglePlay(r)}
                    style={styles.recPlay}
                  >
                    {playing ? <PauseIcon size={12} color="#f0c074" /> : <PlayIcon size={13} color="#f0c074" />}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.recTrack}>
                      <View
                        style={[styles.recTrackFill, { width: `${Math.round((playing ? playProgress : 0) * 100)}%` }]}
                      />
                    </View>
                    {/* Ход расшифровки занимает всю строку метаданных: рядом
                        с «Запись N · время» он не помещается и обрезается, а
                        отдельной строкой под дорожкой уезжал за кромку списка. */}
                    <Text
                      style={[styles.recMeta, loading && styles.recMetaState]}
                      numberOfLines={1}
                    >
                      {loading
                        ? 'Расшифровываю…'
                        : `Запись ${i + 1} · ${fmtTime(playing ? Math.round(playProgress * r.durationSec) : r.durationSec)}`}
                    </Text>
                  </View>
                  {/* Кнопка расшифровки живёт в строке с плеем и корзиной, пока
                      расшифровки нет. Когда она появилась, повтор и удаление
                      уезжают в шапку самой расшифровки — там понятно, к чему
                      они относятся, и строка записи не копит третью иконку. */}
                  {r.transcript === null && (
                    <Pressable
                      accessibilityLabel={
                        r.transcriptState === 'error' ? 'Повторить расшифровку' : 'Расшифровать'
                      }
                      accessibilityRole="button"
                      disabled={loading}
                      onPress={() => startTranscription(r)}
                      style={({ pressed }) => [
                        styles.transcriptionAction,
                        r.transcriptState === 'error' && styles.transcriptionActionError,
                        loading && styles.transcriptionActionLoading,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <TextLines color={r.transcriptState === 'error' ? '#ec9b8e' : colors.greenSoft} />
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityLabel={
                      confirmDeleteId === r.id ? `Подтвердить удаление записи ${i + 1}` : `Удалить запись ${i + 1}`
                    }
                    accessibilityRole="button"
                    onPress={() => askOrConfirmDelete(r.id)}
                    style={[styles.recDel, confirmDeleteId === r.id && styles.recDelConfirming]}
                  >
                    <Trash color={confirmDeleteId === r.id ? '#ec8a7a' : 'rgba(255,255,255,.5)'} />
                  </Pressable>
                </View>

                {r.transcriptState === 'error' && (
                  <Text style={styles.transcriptionError}>Не удалось расшифровать</Text>
                )}

                {r.transcript !== null && (
                  <View style={styles.transcriptBlock}>
                    <View style={styles.transcriptHead}>
                      <Text style={styles.transcriptLabel}>РАСШИФРОВКА</Text>
                      <Pressable
                        accessibilityLabel={`Расшифровать запись ${i + 1} заново`}
                        accessibilityRole="button"
                        disabled={loading}
                        hitSlop={sc(8)}
                        onPress={() => startTranscription(r)}
                        style={({ pressed }) => [
                          styles.transcriptHeadBtn,
                          loading && styles.transcriptionActionLoading,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Regen size={sc(12)} color={colors.greenSoft} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Убрать расшифровку записи ${i + 1}`}
                        accessibilityRole="button"
                        hitSlop={sc(8)}
                        onPress={() => removeTranscript(r.id)}
                        style={({ pressed }) => [styles.transcriptHeadBtn, pressed && { opacity: 0.7 }]}
                      >
                        <Close size={sc(11)} color="rgba(255,255,255,.45)" />
                      </Pressable>
                    </View>
                    <AutoGrowInput
                      value={r.transcript}
                      onChangeText={(transcript) =>
                        updateRecs((current) =>
                          current.map((item) =>
                            item.id === r.id ? { ...item, transcript } : item,
                          ),
                        )
                      }
                      minHeight={TRANSCRIPT_MIN_HEIGHT()}
                      style={styles.transcriptInput}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </BottomSheetScrollView>
        {/* Список длиннее экрана — подсказываем краем, что он продолжается:
            ровный срез у нижней кромки читался как обрыв вёрстки. */}
        {overflowing && (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(29,23,16,0)', '#1d1710']}
            style={styles.scrollFade}
          />
        )}
        </View>

        <View
          style={styles.actionsRow}
          onLayout={(e) => {
            actionsHeight.value = e.nativeEvent.layout.height;
          }}
        >
          {/* микрофон — квадрат в одном ряду с кнопками, как навигация у
              карточки-спутника: подпись не нужна, иконка читается сама */}
          <Pressable
            accessibilityLabel="Записать аудио"
            accessibilityRole="button"
            testID="answer-record-button"
            onPress={startRecording}
            style={({ pressed }) => [styles.micBtn, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Mic color={colors.greenSoft} />
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
            label={
              saving
                ? 'Сохраняю…'
                : timeExpired
                  ? 'Сохранить и завершить'
                  : 'Сохранить'
            }
            onPress={save}
            style={{ flex: 1 }}
            testID="answer-save-button"
          />
        </View>
      </Animated.View>

      {/* оверлей записи — как listening overlay в прототипе */}
      {recording && (
        <View style={[styles.recOverlay, { paddingBottom: insets.bottom + sc(70) }]}>
          <View style={styles.recOverlayContent}>
            <Text style={styles.recOverlayKicker}>идёт запись…</Text>
            <View style={styles.waveRow}>
              {WAVE_BARS.map((b, i) => (
                <WaveBar key={i} color={b.color} delay={b.delay} />
              ))}
            </View>
            <Text style={styles.recOverlayHint}>говори — я запишу твои слова</Text>
          </View>
          <Pressable
            onPress={stopRecording}
            style={({ pressed }) => [styles.recDoneBtn, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Text style={styles.recDoneLabel}>готово</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

/**
 * Поле, растущее под свой текст. Внутренний скролл выключен намеренно: тело
 * шторки прокручивается целиком, а коробка фиксированной высоты прятала бы
 * длинный ответ и держала пустоту при коротком. Задаём minHeight, а не height,
 * чтобы поле ответа могло дотянуться до низа списка через flexGrow, пока
 * контенту хватает места.
 */
function AutoGrowInput({
  minHeight,
  style,
  ...props
}: React.ComponentProps<typeof BottomSheetTextInput> & { minHeight: number }) {
  const [measured, setMeasured] = useState(0);
  const onContentSizeChange = (
    e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) => setMeasured(Math.ceil(e.nativeEvent.contentSize.height));
  return (
    <BottomSheetTextInput
      {...props}
      multiline
      scrollEnabled={false}
      onContentSizeChange={onContentSizeChange}
      style={[style, { minHeight: Math.max(minHeight, measured) }]}
    />
  );
}

const WAVE_BARS = [
  { color: '#d68a2e', delay: 0 },
  { color: '#e6a23c', delay: 150 },
  { color: '#f0c074', delay: 300 },
  { color: '#e6a23c', delay: 450 },
  { color: '#f0c074', delay: 600 },
  { color: '#d68a2e', delay: 750 },
];

// столбик эквалайзера: scaleY качается 0.3 → 1 (анимация wave из прототипа)
function WaveBar({ color, delay }: { color: string; delay: number }) {
  const styles = useStyles(stylesFactory);
  const k = useSharedValue(0.3);
  useEffect(() => {
    k.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(k);
  }, [k, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: k.value }] }));
  return <Animated.View style={[styles.waveBar, { backgroundColor: color }, style]} />;
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
  // Шапка закреплена: вопрос — контекст ответа и не должен уезжать скроллом.
  // flexShrink на крайний случай очень длинного вопроса на низком экране.
  header: {
    flexShrink: 1,
  },
  // Единственная прокручиваемая зона тела. Внешний View нужен для замера
  // видимой высоты и для края-подсказки поверх списка.
  scroll: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: sc(20),
  },
  // flexGrow растягивает контейнер до высоты вьюпорта, пока контент меньше:
  // поле ответа дотягивается до низа и шторка не выглядит полупустой.
  scrollContent: {
    flexGrow: 1,
    paddingBottom: sc(2),
  },
  voiceHint: {
    marginTop: sc(8),
    fontFamily: fonts.serifItalic,
    fontSize: sc(12),
    textAlign: 'center',
    color: 'rgba(240,225,195,.4)',
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
    // Забирает свободное место, пока оно есть; дальше высоту задаёт текст
    // (minHeight из AutoGrowInput), а лишнее уходит в скролл тела.
    flexGrow: 1,
    flexShrink: 0,
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
  audioError: {
    marginTop: sc(7),
    paddingHorizontal: sc(8),
    fontFamily: fonts.sans,
    fontSize: sc(11),
    lineHeight: sc(15),
    textAlign: 'center',
    color: '#ec9b8e',
  },
  recCard: {
    marginTop: sc(8),
    padding: sc(8),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: colors.white08,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(6),
  },
  recPlay: {
    width: sc(30),
    height: sc(30),
    borderRadius: sc(15),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230,162,60,.14)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.34)',
  },
  recTrack: {
    height: sc(5),
    borderRadius: sc(3),
    backgroundColor: 'rgba(255,255,255,.1)',
    overflow: 'hidden',
  },
  recTrackFill: {
    height: '100%',
    borderRadius: sc(3),
    backgroundColor: colors.amber,
  },
  recMeta: {
    marginTop: sc(5),
    fontFamily: fonts.mono,
    fontSize: sc(10),
    color: colors.labelGold,
  },
  // тот же квадрат, что и у кнопки расшифровки — рядом они читаются как пара
  recDel: {
    width: sc(28),
    height: sc(28),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
  },
  recDelConfirming: {
    opacity: 1,
    backgroundColor: 'rgba(220,90,70,.18)',
    borderWidth: 1,
    borderColor: 'rgba(220,90,70,.45)',
  },
  transcriptionAction: {
    width: sc(28),
    height: sc(28),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(127,174,154,.1)',
    borderWidth: 1,
    borderColor: 'rgba(127,174,154,.3)',
  },
  transcriptionActionLoading: {
    opacity: 0.55,
  },
  transcriptionActionError: {
    backgroundColor: 'rgba(220,90,70,.14)',
    borderColor: 'rgba(220,90,70,.4)',
  },
  transcriptionError: {
    marginTop: sc(6),
    fontFamily: fonts.sans,
    fontSize: sc(11.5),
    color: '#ec9b8e',
  },
  recMetaState: {
    color: colors.greenSoft,
  },
  transcriptBlock: {
    marginTop: sc(9),
  },
  transcriptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(6),
    paddingHorizontal: sc(2),
    marginBottom: sc(5),
  },
  // Подпись занимает всю свободную ширину, кнопки прижаты вправо
  transcriptLabel: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: sc(9),
    letterSpacing: sc(1.2),
    color: colors.labelGoldDim,
  },
  transcriptHeadBtn: {
    width: sc(20),
    height: sc(20),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.05)',
  },
  transcriptInput: {
    padding: sc(9),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.035)',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.18)',
    color: colors.parchment,
    fontFamily: fonts.serifRegular,
    fontSize: sc(13.5),
    lineHeight: sc(19),
    textAlignVertical: 'top',
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
  recOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.md,
    backgroundColor: 'rgba(18,12,7,.97)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: sc(28),
  },
  // Оверлей всегда во всю высоту шторки: блок с волной центрируем, иначе он
  // висит у верхнего края, а до кнопки «готово» тянется пустая полоса.
  recOverlayContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(24),
  },
  recOverlayKicker: {
    fontFamily: fonts.sans,
    fontSize: sc(11),
    letterSpacing: sc(2.2),
    textTransform: 'uppercase',
    color: colors.warmHint,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(4),
    height: sc(48),
  },
  waveBar: {
    width: sc(4),
    height: sc(48),
    borderRadius: sc(3),
  },
  recOverlayHint: {
    fontFamily: fonts.serifItalic,
    fontSize: sc(14),
    color: colors.creamDim,
    textAlign: 'center',
    paddingHorizontal: sc(24),
  },
  recDoneBtn: {
    paddingVertical: sc(12),
    paddingHorizontal: sc(30),
    borderRadius: radius.pill,
    backgroundColor: 'rgba(230,162,60,.18)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.42)',
  },
  recDoneLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(14),
    color: colors.creamBright,
  },
});
