import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordingDraft, fmtTime } from '../lib/store';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';
import { screenReaderHiddenProps } from '../lib/a11y';
import { Close, Mic, PlayIcon, PauseIcon, TextLines, Trash } from './icons';

// Свёрнутая расшифровка показывает три строки. Точную обрезку знает только
// нативный слой, поэтому «Показать полностью» вешаем по длине текста:
// ~150 символов — это примерно те же три строки на телефоне.
const isLongTranscript = (transcript: string) => transcript.trim().length > 150;
const STOP_GUARD_MILLIS = 1_500;

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  visible: boolean;
  recordings: RecordingDraft[];
  /** Идёт запись: поверх списка показывается оверлей с волной. */
  recording: boolean;
  recordingPhase: 'idle' | 'starting' | 'recording' | 'stopping';
  playingId: number | null;
  playProgress: number;
  audioError: string | null;
  confirmDeleteId: number | null;
  expandedTranscripts: Record<number, boolean>;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePlay: (recording: RecordingDraft) => void;
  onDelete: (id: number) => void;
  onTranscribe: (recording: RecordingDraft) => void;
  onRemoveTranscript: (id: number) => void;
  onToggleTranscript: (id: number) => void;
  onAppendToAnswer: (transcript: string) => void;
  onDismiss: () => void;
};

/**
 * Голосовые записи ответа — отдельная шторка поверх шторки ответа.
 *
 * В одном окне с ответом список записей конкурировал с полем ввода за высоту:
 * длинная расшифровка выталкивала поле за кромку, а на телефоне с открытой
 * клавиатурой в шторке оставалось ~6 строк на всё сразу. Здесь у записей вся
 * высота, а в ответе от них остаётся только счётчик на микрофоне.
 */
export default function RecordingsSheet({
  sheetRef,
  visible,
  recordings,
  recording,
  recordingPhase,
  playingId,
  playProgress,
  audioError,
  confirmDeleteId,
  expandedTranscripts,
  onStartRecording,
  onStopRecording,
  onTogglePlay,
  onDelete,
  onTranscribe,
  onRemoveTranscript,
  onToggleTranscript,
  onAppendToAnswer,
  onDismiss,
}: Props) {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  // Expo safe-area padding can legitimately be zero on Home Button devices.
  // Keep a base inset there and add it to the real Home Indicator inset.
  const bottomContentInset = insets.bottom + sc(16);
  // The recording overlay is positioned against BottomSheet's full content
  // container, whose logical bottom sits below the clipped snap viewport on
  // compact Home Button devices. Keep its action above that clipped strip.
  const recordingBottomInset = insets.bottom > 0 ? bottomContentInset : sc(70);
  const recordingPending = recordingPhase === 'starting' || recordingPhase === 'stopping';
  const recordingBusy = recordingPhase !== 'idle';
  const [stopReady, setStopReady] = useState(false);

  useEffect(() => {
    if (!recording) {
      setStopReady(false);
      return;
    }
    const timeout = setTimeout(() => setStopReady(true), STOP_GUARD_MILLIS);
    return () => clearTimeout(timeout);
  }, [recording]);

  const stopDisabled = recordingPending || !stopReady;

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        // Во время записи фон не закрывает шторку: микрофон остановит «готово».
        pressBehavior={recordingBusy ? 'none' : 'close'}
      />
    ),
    [recordingBusy],
  );

  const renderHandle = useCallback(
    () => (
      <View style={styles.handleWrap}>
        <View style={styles.handle} />
      </View>
    ),
    [styles],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose={!recordingBusy}
      // Как и в шторке ответа: иначе внутренний список прокручивается только
      // на верхней snap-точке, а на нижней жест перехватывает сама шторка.
      enableContentPanningGesture={false}
      onClose={onDismiss}
      // Контейнер шторки по умолчанию — единый элемент доступности, и всё
      // внутри скрыто от VoiceOver и Maestro. Раскрываем детей.
      accessible={false}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      topInset={insets.top}
      backgroundStyle={styles.sheetBg}
    >
      <View style={styles.sheetBody} accessibilityViewIsModal={visible}>
      <View style={styles.content} {...screenReaderHiddenProps(recording)}>
        <View style={styles.header}>
          <Text style={styles.kicker}>
            {recordings.length ? `ГОЛОСОВЫЕ ЗАПИСИ · ${recordings.length}` : 'ГОЛОСОВЫЕ ЗАПИСИ'}
          </Text>
          <Pressable
            accessibilityLabel="Закрыть записи"
            accessibilityRole="button"
            testID="recordings-close-button"
            disabled={recordingBusy}
            hitSlop={sc(10)}
            onPress={() => sheetRef.current?.close()}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <Close size={sc(13)} color="rgba(255,255,255,.5)" />
          </Pressable>
        </View>

        <BottomSheetScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {!!audioError && <Text style={styles.audioError}>{audioError}</Text>}

          {recordings.length === 0 && !recording && (
            <Text style={styles.emptyHint}>
              Пока записей нет. Нажми «Записать» — и говори.
            </Text>
          )}

          {recordings.map((r, i) => {
            const playing = playingId === r.id;
            const loading = r.transcriptState === 'loading';
            return (
              <View key={r.id} style={styles.recCard} testID={`recording-card-${i}`}>
                <View style={styles.recRow}>
                  <Pressable
                    accessibilityLabel={
                      playing ? `Пауза, запись ${i + 1}` : `Прослушать запись ${i + 1}`
                    }
                    accessibilityRole="button"
                    testID={`recording-play-${i}`}
                    onPress={() => onTogglePlay(r)}
                    style={styles.recPlay}
                  >
                    {playing ? (
                      <PauseIcon size={12} color="#f0c074" />
                    ) : (
                      <PlayIcon size={13} color="#f0c074" />
                    )}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.recTrack}>
                      <View
                        style={[
                          styles.recTrackFill,
                          { width: `${Math.round((playing ? playProgress : 0) * 100)}%` },
                        ]}
                      />
                    </View>
                    {/* Ход расшифровки занимает всю строку метаданных: рядом
                        с «Запись N · время» он не помещается и обрезается. */}
                    <Text style={[styles.recMeta, loading && styles.recMetaState]} numberOfLines={1}>
                      {loading
                        ? 'Расшифровываю…'
                        : `Запись ${i + 1} · ${fmtTime(playing ? Math.round(playProgress * r.durationSec) : r.durationSec)}`}
                    </Text>
                  </View>
                  {/* Кнопка расшифровки живёт в строке с плеем и корзиной, пока
                      расшифровки нет. Когда она появилась, её действия уезжают
                      в шапку самой расшифровки. */}
                  {r.transcript === null && (
                    <Pressable
                      accessibilityLabel={
                        r.transcriptState === 'error' ? 'Повторить расшифровку' : 'Расшифровать'
                      }
                      accessibilityRole="button"
                      testID={`recording-transcribe-${i}`}
                      disabled={loading}
                      onPress={() => onTranscribe(r)}
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
                      confirmDeleteId === r.id
                        ? `Подтвердить удаление записи ${i + 1}`
                        : `Удалить запись ${i + 1}`
                    }
                    accessibilityRole="button"
                    testID={`recording-delete-${i}`}
                    onPress={() => onDelete(r.id)}
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
                        accessibilityLabel={`Убрать расшифровку записи ${i + 1}`}
                        accessibilityRole="button"
                        hitSlop={sc(8)}
                        onPress={() => onRemoveTranscript(r.id)}
                        style={({ pressed }) => [styles.transcriptHeadBtn, pressed && { opacity: 0.7 }]}
                      >
                        <Close size={sc(11)} color="rgba(255,255,255,.45)" />
                      </Pressable>
                    </View>
                    {/* Расшифровка — не черновик ответа, а результат распознания:
                        читается, но не правится. Нужное переносят в поле ответа
                        кнопкой и правят уже там. */}
                    <Text
                      accessibilityLabel={`Расшифровка записи ${i + 1}. ${r.transcript}`}
                      style={styles.transcriptPreview}
                      numberOfLines={expandedTranscripts[r.id] ? undefined : 3}
                    >
                      {r.transcript}
                    </Text>
                    <View style={styles.transcriptActions}>
                      {isLongTranscript(r.transcript) && (
                        <Pressable
                          accessibilityLabel={
                            expandedTranscripts[r.id]
                              ? `Свернуть расшифровку записи ${i + 1}`
                              : `Показать полностью расшифровку записи ${i + 1}`
                          }
                          accessibilityRole="button"
                          accessibilityState={{ expanded: !!expandedTranscripts[r.id] }}
                          hitSlop={sc(6)}
                          onPress={() => onToggleTranscript(r.id)}
                          style={({ pressed }) => [styles.transcriptAction, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={styles.transcriptActionText}>
                            {expandedTranscripts[r.id] ? 'Свернуть' : 'Показать полностью'}
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityHint="Текст расшифровки допишется в конец ответа"
                        accessibilityLabel={`Добавить расшифровку записи ${i + 1} в ответ`}
                        accessibilityRole="button"
                        hitSlop={sc(6)}
                        onPress={() => onAppendToAnswer(r.transcript ?? '')}
                        style={({ pressed }) => [styles.transcriptAction, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.transcriptActionText}>Добавить в ответ</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </BottomSheetScrollView>

        <View style={[styles.actionsRow, { paddingBottom: bottomContentInset }]}>
          <Pressable
            accessibilityLabel={recordings.length ? 'Записать ещё' : 'Записать'}
            accessibilityRole="button"
            testID="recordings-record-button"
            disabled={recordingBusy}
            onPress={() => {
              // Reset synchronously before the overlay replaces this button,
              // so the second physical tap cannot stop the new recording.
              setStopReady(false);
              onStartRecording();
            }}
            style={({ pressed }) => [
              styles.recordBtn,
              recordingBusy && { opacity: 0.5 },
              pressed && !recordingBusy && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Mic size={sc(16)} color={colors.greenSoft} />
            <Text style={styles.recordLabel}>
              {recordingPhase === 'starting'
                ? 'Подготовка…'
                : recordings.length
                  ? 'Записать ещё'
                  : 'Записать'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* оверлей записи — как listening overlay в прототипе */}
      {recording && (
        <View
          accessibilityViewIsModal
          style={[styles.recOverlay, { paddingBottom: recordingBottomInset }]}
        >
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
            accessibilityLabel="Остановить запись"
            accessibilityRole="button"
            testID="recordings-stop-button"
            disabled={stopDisabled}
            onPress={onStopRecording}
            style={({ pressed }) => [
              styles.recDoneBtn,
              stopDisabled && { opacity: 0.5 },
              pressed && !stopDisabled && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <Text style={styles.recDoneLabel}>
              {recordingPhase === 'stopping' ? 'сохраняю…' : 'готово'}
            </Text>
          </Pressable>
        </View>
      )}
      </View>
    </BottomSheet>
  );
}

const SNAP_POINTS = ['78%'];

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
      withRepeat(withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [delay, k]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: k.value }] }));
  return <Animated.View style={[styles.waveBar, { backgroundColor: color }, style]} />;
}

const stylesFactory = () => StyleSheet.create({
  sheetBody: {
    flex: 1,
  },
  sheetBg: {
    backgroundColor: '#1d1710',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white08,
  },
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
  // ADR-0012: колонка держит меру строки и на планшете
  content: {
    ...column(),
    flex: 1,
    paddingHorizontal: sc(16),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: sc(10),
  },
  kicker: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: sc(9.5),
    letterSpacing: sc(1.4),
    color: colors.labelGoldDim,
  },
  closeBtn: {
    width: sc(24),
    height: sc(24),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.05)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: sc(8),
  },
  emptyHint: {
    marginTop: sc(28),
    fontFamily: fonts.serifItalic,
    fontSize: sc(13),
    textAlign: 'center',
    color: 'rgba(240,225,195,.4)',
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
  recMetaState: {
    color: colors.greenSoft,
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
  // Подпись занимает всю свободную ширину, кнопка прижата вправо
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
  // Свёрнутая расшифровка: та же карточка, но три строки и без курсора
  transcriptPreview: {
    padding: sc(9),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.035)',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.18)',
    color: colors.parchment,
    fontFamily: fonts.serifRegular,
    fontSize: sc(13.5),
    lineHeight: sc(19),
  },
  transcriptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(14),
    marginTop: sc(4),
  },
  transcriptAction: {
    paddingVertical: sc(3),
    paddingHorizontal: sc(2),
  },
  transcriptActionText: {
    fontFamily: fonts.mono,
    fontSize: sc(9.5),
    letterSpacing: sc(0.9),
    color: colors.greenSoft,
  },
  actionsRow: {
    paddingTop: sc(10),
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
    height: sc(44),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(127,174,154,.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,174,154,.28)',
  },
  recordLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13.5),
    color: colors.creamBright,
  },
  recOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
