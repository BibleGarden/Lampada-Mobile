import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
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
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
import { colors, fonts, radius, sc } from '../lib/theme';
import { Mic, PlayIcon, PauseIcon, Trash } from './icons';
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
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSheetRef = useRef(false); // фактическое состояние шторки (для слушателей клавиатуры)
  const savingRef = useRef(false);
  // Не даём keyboardDidHide вернуть шторку на 62% после старта записи.
  const recordingOverlayActiveRef = useRef(false);
  // Только эти файлы принадлежат текущему несохранённому черновику. Записи,
  // загруженные из сохранённого ответа, нельзя удалять при отмене редактирования.
  const unsavedRecordingUris = useRef(new Set<string>());
  // qIndex фиксируется при открытии шторки: пока человек пишет, индекс в store
  // может уехать (навигация, генерация) — ответ должен лечь под свой вопрос
  const answerIndexRef = useRef(0);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  // вторая точка — для открытой клавиатуры: keyboardBehavior="extend"
  // поднимает шторку до верхней, и поле ввода с кнопками остаются видны
  const snapPoints = useMemo(() => ['62%', '92%'], []);

  // черновик текущего вопроса подтягивается ДО показа шторки: если делать
  // это в onChange, на открытии успевает мелькнуть контент прошлого вопроса
  const handleOpen = useCallback(() => {
    const st = useSession.getState();
    answerIndexRef.current = st.qIndex;
    const a = st.answers[st.qIndex];
    setText(a?.text ?? '');
    setRecs(a?.recordings ? a.recordings.map((r) => ({ ...r })) : []);
    setConfirmDeleteId(null);
    setConfirmCancel(false);
    setPlayingId(null);
    onEditingChange?.(true);
    sheetRef.current?.snapToIndex(0);
  }, [sheetRef, onEditingChange]);

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
      onAudioBusyChange?.(false);
    },
    [onAudioBusyChange],
  );

  // конец воспроизведения — вернуть иконку play
  useEffect(() => {
    if (playerStatus.didJustFinish) {
      setPlayingId(null);
      onAudioBusyChange?.(false);
    }
  }, [playerStatus.didJustFinish, onAudioBusyChange]);

  // клавиатура появилась — шторка на верхнюю точку, чтобы поле ввода
  // и кнопки остались видны; спряталась — обратно на нижнюю.
  // Слушатель, а не onFocus: свой snap шторка перебивает при показе клавиатуры
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      if (openSheetRef.current) sheetRef.current?.snapToIndex(1);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (openSheetRef.current && !recordingOverlayActiveRef.current) sheetRef.current?.snapToIndex(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [sheetRef]);

  const startRecording = async () => {
    // Оверлей записи не должен остаться под открытой клавиатурой.
    Keyboard.dismiss();
    // Сначала синхронно останавливаем музыку/черновик, затем меняем глобальный
    // audio mode: иначе музыка может попасть в начало голосовой записи.
    player.pause();
    setPlayingId(null);
    onAudioBusyChange?.(true);
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
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
        (modeError) => console.warn('Не удалось восстановить аудиорежим', modeError),
      );
      onAudioBusyChange?.(false);
      throw error;
    }
  };

  const stopRecording = async (): Promise<RecordingDraft | null> => {
    // длительность читаем до stop(): recorderState обновляется раз в 500 мс и занижает
    const durationMillis = recorder.getStatus().durationMillis ?? 0;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return null;
      const draft: RecordingDraft = {
        id: Date.now(),
        uri,
        durationSec: Math.max(1, Math.round(durationMillis / 1000)),
        transcript: null,
      };
      unsavedRecordingUris.current.add(uri);
      setRecs((prev) => [...prev, draft]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return draft;
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
      const removed = recs.find((r) => r.id === id);
      if (removed && unsavedRecordingUris.current.delete(removed.uri)) {
        try {
          const file = new File(removed.uri);
          if (file.exists) file.delete();
        } catch {
          // Удаление из списка должно сработать, даже если файл уже недоступен.
        }
      }
      setRecs((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    setConfirmDeleteId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    let finalRecs = recs;
    try {
      // активная запись не должна молча продолжаться после сохранения
      if (recorderState.isRecording) {
        const draft = await stopRecording();
        if (draft) finalRecs = [...recs, draft];
      }
      saveAnswerToStore(answerIndexRef.current, text, finalRecs);
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
    }
  };

  // «Отмена» с подтверждением: несохранённый контент не выбрасываем молча
  const requestClose = () => {
    if (savingRef.current) return;
    const hasContent = !!text.trim() || recs.length > 0;
    if (!hasContent || confirmCancel) {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      setConfirmCancel(false);
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

  const recording = recorderState.isRecording;
  // прогресс воспроизведения активной записи (0..1)
  const playProgress =
    playingId !== null && playerStatus.duration > 0
      ? Math.min(playerStatus.currentTime / playerStatus.duration, 1)
      : 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      // без этого v5 подмешивает snap-точку «по контенту», и индексы съезжают
      enableDynamicSizing={false}
      // Свайп доступен только для пустой шторки. Иначе закрытие возможно
      // исключительно через «Отмена» → «Точно закрыть?» или «Сохранить».
      enablePanDownToClose={!timeExpired && !hasUnsavedContent}
      onChange={async (i) => {
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
          onAudioBusyChange?.(false);
          setConfirmCancel(false);
          discardUnsavedRecordings();
        }
      }}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.orbRow}>
          <View style={styles.orb} />
          <Text style={styles.orbLabel}>СПУТНИК СПРОСИЛ</Text>
        </View>
        <Text style={styles.question}>
          {questions[answerIndexRef.current] ?? questions[qIndex]}
        </Text>

        <BottomSheetTextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Запиши, что откликается…"
          placeholderTextColor="rgba(240,230,210,.35)"
          style={styles.input}
        />

        <Pressable
          onPress={startRecording}
          style={({ pressed }) => [styles.micBtn, pressed && { transform: [{ scale: 0.985 }] }]}
        >
          <Mic color={colors.greenSoft} />
          <Text style={styles.micLabel}>Записать аудио</Text>
        </Pressable>

        {recs.map((r, i) => {
          const playing = playingId === r.id;
          return (
            <View key={r.id} style={styles.recRow}>
              <Pressable onPress={() => togglePlay(r)} style={styles.recPlay}>
                {playing ? <PauseIcon size={12} color="#f0c074" /> : <PlayIcon size={13} color="#f0c074" />}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.recTrack}>
                  <View
                    style={[styles.recTrackFill, { width: `${Math.round((playing ? playProgress : 0) * 100)}%` }]}
                  />
                </View>
                <Text style={styles.recMeta}>
                  Запись {i + 1} · {fmtTime(playing ? Math.round(playProgress * r.durationSec) : r.durationSec)}
                </Text>
              </View>
              <Pressable
                onPress={() => askOrConfirmDelete(r.id)}
                style={[styles.recDel, confirmDeleteId === r.id && styles.recDelConfirming]}
              >
                <Trash color={confirmDeleteId === r.id ? '#ec8a7a' : 'rgba(255,255,255,.5)'} />
              </Pressable>
            </View>
          );
        })}

        <View style={styles.actionsRow}>
          <Pressable
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
            label={timeExpired ? 'Сохранить и завершить' : 'Сохранить'}
            onPress={save}
            style={{ flex: 1 }}
          />
        </View>
      </BottomSheetScrollView>

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

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: '#1d1710',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white08,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,.13)',
    width: sc(36),
  },
  content: {
    paddingHorizontal: sc(16),
    paddingBottom: sc(32),
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
    minHeight: sc(96),
    maxHeight: sc(200),
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
    marginTop: sc(8),
    paddingVertical: sc(9),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(127,174,154,.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,174,154,.28)',
  },
  micLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    color: colors.greenSoft,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginTop: sc(8),
    padding: sc(8),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: colors.white08,
  },
  recPlay: {
    width: sc(34),
    height: sc(34),
    borderRadius: sc(17),
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
  recDel: {
    width: sc(28),
    height: sc(28),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    opacity: 0.45,
  },
  recDelConfirming: {
    opacity: 1,
    backgroundColor: 'rgba(220,90,70,.18)',
    borderWidth: 1,
    borderColor: 'rgba(220,90,70,.45)',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginTop: sc(16),
  },
  cancelBtn: {
    paddingHorizontal: sc(14),
    height: sc(44),
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
    fontFamily: fonts.sans,
    fontSize: sc(13),
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
  recOverlayContent: {
    alignItems: 'center',
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
