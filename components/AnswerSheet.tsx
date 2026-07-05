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

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  /** Сессия зовёт это перед уходом на рефлексию: дописать открытый черновик */
  flushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
};

// Шторка ответа: текст + голосовые записи. Открывается на текущем вопросе,
// черновик считывается из сохранённого ответа.
export default function AnswerSheet({ sheetRef, flushRef }: Props) {
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
  const openRef = useRef(false);
  // qIndex фиксируется при открытии шторки: пока человек пишет, индекс в store
  // может уехать (навигация, генерация) — ответ должен лечь под свой вопрос
  const answerIndexRef = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  // вторая точка — для открытой клавиатуры: keyboardBehavior="extend"
  // поднимает шторку до верхней, и поле ввода с кнопками остаются видны
  const snapPoints = useMemo(() => ['62%', '92%'], []);

  // при открытии подтягиваем черновик текущего вопроса
  const handleOpen = useCallback(() => {
    const st = useSession.getState();
    answerIndexRef.current = st.qIndex;
    const a = st.answers[st.qIndex];
    setText(a?.text ?? '');
    setRecs(a?.recordings ? a.recordings.map((r) => ({ ...r })) : []);
    setConfirmDeleteId(null);
    setConfirmCancel(false);
    setPlayingId(null);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
    },
    [],
  );

  // конец воспроизведения — вернуть иконку play
  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

  // клавиатура появилась — шторка на верхнюю точку, чтобы поле ввода
  // и кнопки остались видны; спряталась — обратно на нижнюю.
  // Слушатель, а не onFocus: свой snap шторка перебивает при показе клавиатуры
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      if (openRef.current) sheetRef.current?.snapToIndex(1);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (openRef.current) sheetRef.current?.snapToIndex(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [sheetRef]);

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    // пресет обязателен: без options рекордер переиспользует один URL
    // и каждая новая запись затирает файл предыдущей
    await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    recorder.record();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const stopRecording = async (): Promise<RecordingDraft | null> => {
    // длительность читаем до stop(): recorderState обновляется раз в 500 мс и занижает
    const durationMillis = recorder.getStatus().durationMillis ?? 0;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri) return null;
    const draft: RecordingDraft = {
      id: Date.now(),
      uri,
      durationSec: Math.max(1, Math.round(durationMillis / 1000)),
      transcript: null,
    };
    setRecs((prev) => [...prev, draft]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return draft;
  };

  const togglePlay = (r: RecordingDraft) => {
    if (playingId === r.id) {
      player.pause();
      setPlayingId(null);
      return;
    }
    player.replace(r.uri);
    player.play();
    setPlayingId(r.id);
  };

  const askOrConfirmDelete = (id: number) => {
    if (confirmDeleteId === id) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmDeleteId(null);
      if (playingId === id) {
        player.pause();
        setPlayingId(null);
      }
      setRecs((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    setConfirmDeleteId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  const save = async () => {
    let finalRecs = recs;
    // активная запись не должна молча продолжаться после сохранения
    if (recorderState.isRecording) {
      const draft = await stopRecording();
      if (draft) finalRecs = [...recs, draft];
    }
    saveAnswerToStore(answerIndexRef.current, text, finalRecs);
    Keyboard.dismiss();
    sheetRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // «Отмена» с подтверждением: несохранённый контент не выбрасываем молча
  const requestClose = () => {
    const hasContent = !!text.trim() || recs.length > 0;
    if (!hasContent || confirmCancel) {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      setConfirmCancel(false);
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
      if (!openRef.current) return;
      await save();
    };
    return () => {
      if (flushRef) flushRef.current = null;
    };
  });

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
    ),
    [],
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
      enablePanDownToClose
      onChange={(i) => {
        const wasOpen = openRef.current;
        openRef.current = i >= 0;
        if (i >= 0 && !wasOpen) handleOpen();
        // закрыли (свайпом/кнопкой) во время записи — остановить микрофон
        if (i < 0 && recorder.isRecording) stopRecording();
        if (i < 0 && playingId !== null) {
          player.pause();
          setPlayingId(null);
        }
        if (i < 0) setConfirmCancel(false);
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
          {questions[openRef.current ? answerIndexRef.current : qIndex]}
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
          <GoldButton label="Сохранить" onPress={save} style={{ flex: 1 }} />
        </View>
      </BottomSheetScrollView>

      {/* оверлей записи — как listening overlay в прототипе */}
      {recording && (
        <View style={styles.recOverlay}>
          <Text style={styles.recOverlayKicker}>идёт запись…</Text>
          <View style={styles.waveRow}>
            {WAVE_BARS.map((b, i) => (
              <WaveBar key={i} color={b.color} delay={b.delay} />
            ))}
          </View>
          <Text style={styles.recOverlayHint}>говори — я запишу твои слова</Text>
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
    color: 'rgba(170,210,190,.5)',
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: sc(16),
    lineHeight: sc(22),
    color: '#f2e7cf',
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
    color: '#f2e9d6',
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
    color: 'rgba(240,200,140,.55)',
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
    color: colors.white45,
  },
  recOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.md,
    backgroundColor: 'rgba(18,12,7,.97)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(24),
  },
  recOverlayKicker: {
    fontFamily: fonts.sans,
    fontSize: sc(11),
    letterSpacing: sc(2.2),
    textTransform: 'uppercase',
    color: 'rgba(240,200,140,.75)',
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
    color: 'rgba(240,225,195,.6)',
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
    color: '#f6ecd4',
  },
});
