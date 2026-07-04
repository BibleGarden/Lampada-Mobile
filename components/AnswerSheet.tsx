import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
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
import { useSession, RecordingDraft } from '../lib/store';
import { colors, fonts, radius } from '../lib/theme';
import { Mic, PlayIcon, PauseIcon, Trash, Close } from './icons';
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
  const [playingId, setPlayingId] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  // qIndex фиксируется при открытии шторки: пока человек пишет, индекс в store
  // может уехать (навигация, генерация) — ответ должен лечь под свой вопрос
  const answerIndexRef = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  const snapPoints = useMemo(() => ['62%'], []);

  // при открытии подтягиваем черновик текущего вопроса
  const handleOpen = useCallback(() => {
    const st = useSession.getState();
    answerIndexRef.current = st.qIndex;
    const a = st.answers[st.qIndex];
    setText(a?.text ?? '');
    setRecs(a?.recordings ? a.recordings.map((r) => ({ ...r })) : []);
    setConfirmDeleteId(null);
    setPlayingId(null);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  // конец воспроизведения — вернуть иконку play
  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

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

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
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
          onPress={recording ? stopRecording : startRecording}
          style={({ pressed }) => [
            styles.micBtn,
            recording && styles.micBtnActive,
            pressed && { transform: [{ scale: 0.985 }] },
          ]}
        >
          <Mic color={recording ? '#f0a0a0' : colors.goldSoft} />
          <Text style={[styles.micLabel, recording && { color: '#f0a0a0' }]}>
            {recording ? 'Остановить запись' : 'Записать аудио'}
          </Text>
        </Pressable>

        {recs.map((r) => (
          <View key={r.id} style={styles.recRow}>
            <Pressable onPress={() => togglePlay(r)} style={styles.recPlay}>
              {playingId === r.id ? <PauseIcon /> : <PlayIcon />}
            </Pressable>
            <Text style={styles.recDur}>
              {Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, '0')}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => askOrConfirmDelete(r.id)} style={styles.recDel}>
              {confirmDeleteId === r.id ? (
                <Text style={styles.recDelConfirm}>точно?</Text>
              ) : (
                <Trash />
              )}
            </Pressable>
          </View>
        ))}

        <GoldButton label="Сохранить ответ" onPress={save} style={{ marginTop: 16 }} />
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            sheetRef.current?.close();
          }}
          style={styles.cancelBtn}
        >
          <Close size={13} />
          <Text style={styles.cancelLabel}>Закрыть без сохранения</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: '#1d1710',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.white08,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,.13)',
    width: 36,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  orbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  orb: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#6fae93',
  },
  orbLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: 'rgba(170,210,190,.5)',
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 22,
    color: '#f2e7cf',
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    minHeight: 96,
    maxHeight: 200,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
    color: '#f2e9d6',
    fontSize: 15,
    lineHeight: 23,
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.btnGoldBgDim,
    borderWidth: 1,
    borderColor: colors.btnGoldBorderDim,
  },
  micBtnActive: {
    backgroundColor: 'rgba(240,120,120,.1)',
    borderColor: 'rgba(240,120,120,.35)',
  },
  micLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.goldSoft,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: colors.white08,
  },
  recPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.btnGoldBgDim,
  },
  recDur: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: 'rgba(240,230,210,.6)',
  },
  recDel: {
    minWidth: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recDelConfirm: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: '#f0a0a0',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  cancelLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.white45,
  },
});
