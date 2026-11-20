import { useI18n } from '../lib/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordingDraft, fmtTime } from '../lib/store';
import { recordedSeconds } from '../lib/recordingFile';
import { recordingSecondsRemaining } from '../lib/transcriptionLimits';
import { transcriptionErrorMessageKey } from '../lib/transcriptionErrors';
import { fitRecordingOverlay } from '../lib/recordingOverlayGeometry';
import { colors, column, fonts, radius, sc, screenGutter, useStyles } from '../lib/theme';
import { screenReaderHiddenProps } from '../lib/a11y';
import { ChevronDown, Mic, PlayIcon, PauseIcon, TextLines, Trash } from './icons';
import { useVisibleScreen } from '../lib/useVisibleScreen';
import KeyboardSheet, { KeyboardSheetBody } from './keyboard/KeyboardSheet';
import QuestionHeader from './QuestionHeader';
import { GoldButton } from './ui';

// A collapsed transcript shows three lines. Only the native layer knows the
// exact truncation, so "Show all" (components.answers.expand) keys off text
// length: ~150 chars is roughly those same three lines on a phone.
const isLongTranscript = (transcript: string) => transcript.trim().length > 150;
const STOP_GUARD_MILLIS = 1_500;
// The timer shows whole seconds; polling faster than a second keeps it from lagging.
const ELAPSED_POLL_MILLIS = 250;
// A transcript usually arrives within seconds; past this mark we hint that waiting is optional.
const SLOW_TRANSCRIPTION_MILLIS = 4_000;

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  visible: boolean;
  /** The answer's question: the recordings sheet covers it inside the answer sheet. */
  question: string;
  recordings: RecordingDraft[];
  /** Recording in progress: a wave overlay is shown over the list. */
  recording: boolean;
  recordingPhase: 'idle' | 'starting' | 'recording' | 'stopping';
  limitReached: boolean;
  limitError: string | null;
  /** Recording duration per the native recorder's clock. */
  getRecordedMillis: () => number;
  playingId: number | null;
  pausedId: number | null;
  playProgress: number;
  audioError: string | null;
  confirmDeleteId: number | null;
  expandedTranscripts: Record<number, boolean>;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePlay: (recording: RecordingDraft) => void;
  onDelete: (id: number) => void;
  onTranscribe: (recording: RecordingDraft) => void;
  onToggleTranscript: (id: number) => void;
  onAppendToAnswer: (transcript: string) => void;
  onDismiss: () => void;
};

/**
 * The answer's voice recordings — a separate sheet on top of the answer sheet.
 *
 * Sharing one window with the answer, the recording list competed with the
 * input field for height: a long transcript pushed the field off the edge, and
 * on a phone with the keyboard open only ~6 lines remained for everything at
 * once. Here the recordings get the full height, and the answer keeps only the
 * counter on the mic.
 */
export default function RecordingsSheet({
  sheetRef,
  visible,
  question,
  recordings,
  recording,
  recordingPhase,
  limitReached,
  limitError,
  getRecordedMillis,
  playingId,
  pausedId,
  playProgress,
  audioError,
  confirmDeleteId,
  expandedTranscripts,
  onStartRecording,
  onStopRecording,
  onTogglePlay,
  onDelete,
  onTranscribe,
  onToggleTranscript,
  onAppendToAnswer,
  onDismiss,
}: Props) {
  const { t } = useI18n();
  const screenVisible = useVisibleScreen();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const recordingPending = recordingPhase === 'starting' || recordingPhase === 'stopping';
  const recordingBusy = recordingPhase !== 'idle';
  const [stopReady, setStopReady] = useState(false);
  const [overlaySizes, setOverlaySizes] = useState({ viewport: 0, kicker: 0, elapsed: 0, hint: 0, error: 0 });
  const measureOverlay = (part: keyof typeof overlaySizes) => (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setOverlaySizes((current) => current[part] === height ? current : { ...current, [part]: height });
  };
  const overlayFit = overlaySizes.viewport === 0 ? { gap: sc(24), waveHeight: sc(48) } : fitRecordingOverlay(
    overlaySizes.viewport - styles.recOverlayContent.paddingVertical * 2,
    overlaySizes.kicker + overlaySizes.elapsed + overlaySizes.hint + (limitError ? overlaySizes.error : 0),
    limitError ? 4 : 3,
    sc(24),
    sc(8),
    sc(48),
    sc(24),
  );

  useEffect(() => {
    if (!recording) {
      setStopReady(false);
      return;
    }
    const timeout = setTimeout(() => setStopReady(true), STOP_GUARD_MILLIS);
    return () => clearTimeout(timeout);
  }, [recording]);

  const stopDisabled = recordingPending || !stopReady;

  // How much has been recorded. Counted only in the recording phase: during
  // stopping the timer freezes at the last value; after recording it resets.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!recording) {
      setElapsedSec(0);
      return;
    }
    if (!visible || !screenVisible || recordingPhase !== 'recording') return;
    const update = () => setElapsedSec(recordedSeconds(getRecordedMillis()));
    update();
    const interval = setInterval(update, ELAPSED_POLL_MILLIS);
    return () => clearInterval(interval);
  }, [recording, recordingPhase, getRecordedMillis, visible, screenVisible]);
  const elapsedLabel = fmtTime(elapsedSec);
  const remainingSeconds = recordingSecondsRemaining(elapsedSec, limitReached);
  const timeLabel = remainingSeconds === null
    ? elapsedLabel
    : t('components.answers.recordingRemaining', { time: fmtTime(remainingSeconds) });

  // VoiceOver hears the slow-transcription hint once per sheet while any
  // transcription is running. Do not announce behind a closed sheet or during
  // a recording: the "you can close" advice would be wrong then.
  const transcribing = recordings.some((r) => r.transcriptState === 'loading');
  const slowHintAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!transcribing) slowHintAnnouncedRef.current = false;
  }, [transcribing]);
  const announceSlowTranscription = () => {
    if (slowHintAnnouncedRef.current || !visible || recordingBusy) return;
    slowHintAnnouncedRef.current = true;
    AccessibilityInfo.announceForAccessibilityWithOptions(
      t('components.answers.transcriptionContinues'),
      { queue: true },
    );
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        // While recording, the backdrop does not close the sheet: the "Done" button stops the mic.
        pressBehavior={recordingBusy ? 'none' : 'close'}
        // The backdrop has no localized label; the chevron button closes the sheet.
        accessible={false}
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

  const actions = recording ? (
    // The double-tap guard does not dim the button: the recording is already
    // running, and a translucent "Done" would look like a recording not started.
    <GoldButton
      compact
      label={recordingPhase === 'stopping' ? t('components.answers.saving') : t('components.answers.done')}
      accessibilityLabel={t('components.answers.stop')}
      accessibilityValue={{ text: elapsedLabel }}
      testID="recordings-stop-button"
      disabled={stopDisabled}
      onPress={onStopRecording}
    />
  ) : (
    <Pressable
      accessibilityLabel={recordings.length ? t('components.answers.recordMore') : t('components.answers.record')}
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
          ? t('components.answers.preparing')
          : recordings.length
            ? t('components.answers.recordMore')
            : t('components.answers.record')}
      </Text>
    </Pressable>
  );

  return (
    <KeyboardSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose={!recordingBusy}
      // Same as the answer sheet: otherwise the inner list scrolls only at the
      // top snap point, and at the lower one the sheet itself grabs the gesture.
      enableContentPanningGesture={false}
      onClose={onDismiss}
      // By default the sheet's container is a single accessibility element and
      // everything inside is hidden from VoiceOver and Maestro. Expose the children.
      accessible={false}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      topInset={insets.top}
      // While recording the whole sheet takes the overlay color: the question
      // above and the footer below are not set off as separate cards.
      backgroundStyle={recording ? styles.sheetBgRecording : styles.sheetBg}
      accessibilityModal={visible}
      onAccessibilityEscape={() => {
        if (!recordingBusy) sheetRef.current?.close();
      }}
      footer={actions}
      footerHidden={!visible}
    >
      {/* a closed sheet is off-screen, but without the flag it would stay in the traversal */}
      <KeyboardSheetBody
        scrollable={false}
        {...screenReaderHiddenProps(!visible)}
      >
      <View style={styles.questionWrap}>
        <QuestionHeader question={question} testID="recordings-question" />
      </View>
      {/* The recording overlay covers the list but not the question: that is what the voice answers. */}
      <View style={styles.stage}>
      <View style={styles.content} {...screenReaderHiddenProps(recording)}>
        <View style={styles.header}>
          <Text style={styles.kicker}>
            {recordings.length ? t('components.answers.recordingsCount', { count: recordings.length }) : t('components.answers.recordingsTitle')}
          </Text>
          <Pressable
            accessibilityLabel={t('components.answers.closeRecordings')}
            accessibilityRole="button"
            testID="recordings-close-button"
            disabled={recordingBusy}
            hitSlop={sc(10)}
            onPress={() => sheetRef.current?.close()}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronDown size={18} color="rgba(255,255,255,.5)" />
          </Pressable>
        </View>

        <BottomSheetScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          fadingEdgeLength={sc(24)}
        >
          {!!audioError && <Text style={styles.audioError}>{audioError}</Text>}

          {recordings.length === 0 && !recording && (
            <Text style={styles.emptyHint}>
              {t('components.answers.empty')}
            </Text>
          )}

          {recordings.map((r, i) => {
            const playing = playingId === r.id;
            const hasProgress = playing || pausedId === r.id;
            const loading = r.transcriptState === 'loading';
            return (
              <View key={r.id} style={styles.recCard} testID={`recording-card-${i}`}>
                <View style={styles.recRow}>
                  <Pressable
                    accessibilityLabel={
                      playing ? t('components.answers.pauseIndex', { index: i + 1 }) : t('components.answers.playIndex', { index: i + 1 })
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
                          { width: `${Math.round((hasProgress ? playProgress : 0) * 100)}%` },
                        ]}
                      />
                    </View>
                    {/* Transcription progress takes the whole metadata line:
                        next to "Recording N · time" it would not fit and gets cut. */}
                    <Text
                      style={[styles.recMeta, loading && styles.recMetaState]}
                      numberOfLines={1}
                      testID={loading ? `recording-transcribing-${i}` : `recording-meta-${i}`}
                    >
                      {loading
                        ? t('components.answers.transcribing')
                        : t('components.answers.recordingIndex', {
                          index: i + 1,
                          duration: r.durationSec === 0
                            ? t('components.answers.durationUnknown')
                            : fmtTime(hasProgress ? Math.round(playProgress * r.durationSec) : r.durationSec),
                        })}
                    </Text>
                  </View>
                  {/* The transcribe button is available while the recording has no text. */}
                  {r.transcript === null && (
                    <Pressable
                      accessibilityLabel={
                        r.transcriptState === 'error' ? t('components.answers.retryTranscription') : t('components.answers.transcribe')
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
                        ? t('components.answers.confirmDeleteIndex', { index: i + 1 })
                        : t('components.answers.deleteIndex', { index: i + 1 })
                    }
                    accessibilityRole="button"
                    testID={`recording-delete-${i}`}
                    onPress={() => onDelete(r.id)}
                    style={[styles.recDel, confirmDeleteId === r.id && styles.recDelConfirming]}
                  >
                    <Trash color={confirmDeleteId === r.id ? '#ec8a7a' : 'rgba(255,255,255,.5)'} />
                  </Pressable>
                </View>

                {loading && visible && screenVisible && (
                  <SlowTranscriptionHint index={i} onShown={announceSlowTranscription} />
                )}

                {r.transcriptState === 'error' && (
                  <Text style={styles.transcriptionError}>
                    {t(transcriptionErrorMessageKey(r.transcriptError ?? 'unknown'))}
                  </Text>
                )}

                {r.transcript !== null && (
                  <View style={styles.transcriptBlock}>
                    <Text style={styles.transcriptLabel}>{t('components.answers.transcriptTitle')}</Text>
                    {/* The transcript is not an answer draft but recognition
                        output: readable, not editable. People move the useful
                        part into the answer field with the button and edit there. */}
                    <Text
                      accessibilityLabel={t('components.answers.transcriptIndex', { index: i + 1, transcript: r.transcript ?? '' })}
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
                              ? t('components.answers.collapseTranscriptIndex', { index: i + 1 })
                              : t('components.answers.expandTranscriptIndex', { index: i + 1 })
                          }
                          accessibilityRole="button"
                          accessibilityState={{ expanded: !!expandedTranscripts[r.id] }}
                          hitSlop={sc(6)}
                          onPress={() => onToggleTranscript(r.id)}
                          style={({ pressed }) => [styles.transcriptAction, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={styles.transcriptActionText}>
                            {expandedTranscripts[r.id] ? t('components.answers.collapse') : t('components.answers.expand')}
                          </Text>
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityHint={t('components.answers.appendHint')}
                        accessibilityLabel={t('components.answers.appendTranscriptIndex', { index: i + 1 })}
                        accessibilityRole="button"
                        hitSlop={sc(6)}
                        onPress={() => onAppendToAnswer(r.transcript ?? '')}
                        style={({ pressed }) => [styles.transcriptAction, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.transcriptActionText}>{t('components.answers.append')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </BottomSheetScrollView>
      </View>

      {/* recording overlay — like the prototype's listening overlay */}
      {recording && (
        <View style={styles.recOverlay}>
          <BottomSheetScrollView
            style={styles.recOverlayScroll}
            contentContainerStyle={[styles.recOverlayContent, { gap: overlayFit.gap }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
            onLayout={measureOverlay('viewport')}
          >
            <Text style={styles.recOverlayKicker} onLayout={measureOverlay('kicker')}>
              {t('components.answers.recording')}
            </Text>
            <View style={[styles.waveRow, { height: overlayFit.waveHeight }]}>
              {WAVE_BARS.map((b, i) => (
                <WaveBar key={i} color={b.color} delay={b.delay} active={visible && screenVisible} height={overlayFit.waveHeight} />
              ))}
            </View>
            {/* No live region: VoiceOver reads the time on focus, not every second. */}
            <Text
              accessibilityLabel={remainingSeconds === null
                ? t('components.answers.recordedTime', { time: elapsedLabel })
                : timeLabel}
              style={[styles.recElapsed, remainingSeconds !== null && styles.recElapsedWarning]}
              testID="recording-elapsed"
              onLayout={measureOverlay('elapsed')}
            >
              {timeLabel}
            </Text>
            <Text style={styles.recOverlayHint} onLayout={measureOverlay('hint')}>
              {t('components.answers.speakHint')}
            </Text>
            {limitError && (
              <Text style={styles.recOverlayError} testID="recording-limit-error" onLayout={measureOverlay('error')}>
                {t(limitError)}
              </Text>
            )}
          </BottomSheetScrollView>
        </View>
      )}
      </View>
      </KeyboardSheetBody>
    </KeyboardSheet>
  );
}

const SNAP_POINTS = ['78%'];
// The former overlay rgba(18,12,7,.97) over the sheet background, without transparency.
const RECORDING_BACKGROUND = '#120c07';
const SHEET_BORDER = 1;

const WAVE_BARS = [
  { color: '#d68a2e', delay: 0 },
  { color: '#e6a23c', delay: 150 },
  { color: '#f0c074', delay: 300 },
  { color: '#e6a23c', delay: 450 },
  { color: '#f0c074', delay: 600 },
  { color: '#d68a2e', delay: 750 },
];

// The hint appears only while a transcription runs past the threshold. The
// promise is honest: closing the recordings sheet does not interrupt it, and
// "Save" and moving on to reflection wait for the result (AnswerSheet.save).
// The sheet announces it.
function SlowTranscriptionHint({ index, onShown }: { index: number; onShown: () => void }) {
  const styles = useStyles(stylesFactory);
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(true);
      onShownRef.current();
    }, SLOW_TRANSCRIPTION_MILLIS);
    return () => clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return (
    <Text style={styles.transcriptionHint} testID={`recording-transcription-hint-${index}`}>
      {t('components.answers.transcriptionContinues')}
    </Text>
  );
}

// equalizer bar: scaleY swings 0.3 → 1 (the prototype's wave animation)
function WaveBar({ color, delay, active, height }: { color: string; delay: number; active: boolean; height: number }) {
  const styles = useStyles(stylesFactory);
  const k = useSharedValue(0.3);
  useEffect(() => {
    if (!active) return;
    // The swing comes from the repeat's start value: after a pause we begin at 0.3.
    k.value = 0.3;
    k.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
    return () => cancelAnimation(k);
  }, [delay, k, active]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: k.value }] }));
  return <Animated.View style={[styles.waveBar, { backgroundColor: color, height }, style]} />;
}

const stylesFactory = () => StyleSheet.create({
  sheetBg: {
    backgroundColor: '#1d1710',
    borderRadius: radius.md,
    borderWidth: SHEET_BORDER,
    borderColor: colors.white08,
  },
  sheetBgRecording: {
    backgroundColor: RECORDING_BACKGROUND,
    borderRadius: radius.md,
    borderWidth: SHEET_BORDER,
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
  // ADR-0012: the column holds the line measure on tablets too
  questionWrap: {
    ...column(),
    paddingHorizontal: screenGutter(),
  },
  stage: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    ...column(),
    flex: 1,
    paddingHorizontal: screenGutter(),
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
    color: colors.labelGold,
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
    paddingBottom: sc(24),
  },
  emptyHint: {
    marginTop: sc(28),
    fontFamily: fonts.serifItalic,
    fontSize: sc(13),
    textAlign: 'center',
    color: colors.creamDim,
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
  // the same square as the transcribe button — side by side they read as a pair
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
  transcriptionHint: {
    marginTop: sc(6),
    fontFamily: fonts.sans,
    fontSize: sc(11.5),
    color: colors.creamDim,
  },
  transcriptBlock: {
    marginTop: sc(9),
  },
  transcriptLabel: {
    paddingHorizontal: sc(2),
    marginBottom: sc(5),
    fontFamily: fonts.mono,
    fontSize: sc(9),
    letterSpacing: sc(1.2),
    color: colors.labelGold,
  },
  // Collapsed transcript: the same card, but three lines and no cursor
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
  // The overlay hides the list but not the sheet frame: the side borders run to the bottom.
  recOverlay: {
    position: 'absolute',
    top: 0,
    left: SHEET_BORDER,
    right: SHEET_BORDER,
    bottom: 0,
    backgroundColor: RECORDING_BACKGROUND,
    paddingTop: sc(28),
  },
  recOverlayScroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  // The overlay always spans the sheet's full height: center the wave block,
  // otherwise it hangs at the top and an empty strip stretches down to the
  // "Done" button.
  recOverlayContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: sc(4),
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
  recElapsed: {
    fontFamily: fonts.mono,
    fontSize: sc(13),
    letterSpacing: sc(1),
    color: colors.warmHint,
  },
  recElapsedWarning: {
    color: '#f0c074',
    backgroundColor: 'rgba(230,162,60,.14)',
    borderRadius: radius.sm,
    paddingHorizontal: sc(10),
    paddingVertical: sc(5),
  },
  recOverlayHint: {
    fontFamily: fonts.serifItalic,
    fontSize: sc(14),
    color: colors.creamDim,
    textAlign: 'center',
    paddingHorizontal: sc(24),
  },
  recOverlayError: {
    fontFamily: fonts.sans,
    fontSize: sc(12),
    color: '#ec9b8e',
    textAlign: 'center',
    paddingHorizontal: sc(24),
  },
});
