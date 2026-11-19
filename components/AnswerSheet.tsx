import { dismissKeyboard } from '../lib/dismissKeyboard';
import { useI18n } from '../lib/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useSession, RecordingDraft } from '../lib/store';
import { reportTranscriptionFailure, transcribeRecording } from '../lib/transcription';
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
import { errorKind, recordDiagnostic } from '../lib/db';
import { createStoppedRecordingDraft, recordingFileIssue, waitForRecordingFile } from '../lib/recordingFile';
import {
  createRecordingOperation,
  recoverRecordingAfterTerminalError,
  recorderStatusRequiresRecovery,
  startPreparedRecording,
} from '../lib/recordingOperation';
import {
  TRANSIENT_AUDIO_PLAYER_OPTIONS,
  type RecordingAudioModeLease,
  type AudioSessionLease,
} from '../lib/audioModeCoordinator';
import { audioModeCoordinator } from '../lib/audioSession';
import { colors, column, fonts, isTablet, radius, sc, screenGutter, touchSlop, useStyles } from '../lib/theme';
import { screenReaderHiddenProps } from '../lib/a11y';
import { createPlaybackLeaseOperation, playAudioRecording, waitForAudioPlayerReady } from '../lib/audioPlayerOperation';
import { isAnswerAudioIdle } from '../lib/audioBusy';
import { watchNativePlaybackStart } from '../lib/nativePlaybackStart';
import { playCueUntilComplete } from '../lib/audioCueOperation';
import { Mic } from './icons';
import QuestionHeader from './QuestionHeader';
import RecordingsSheet from './RecordingsSheet';
import PrivacyConsentDialog from './PrivacyConsentDialog';
import { GoldButton } from './ui';
import KeyboardSheet, { KeyboardSheetBody, KeyboardSheetTextInput } from './keyboard/KeyboardSheet';
import { useKeyboardLayout } from '../lib/useKeyboardLayout';
import {
  keyboardShowing, keyboardSnapOnHandleRelease, keyboardSnapTarget, reconcileKeyboardSnap, settledKeyboardSnapRequest, type KeyboardSnap,
} from '../lib/keyboardGeometry';

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
  /** The only way to open the sheet: the draft is prepared BEFORE the
   * animation, otherwise the previous question's content flashes on open */
  openRef: React.MutableRefObject<(() => void) | null>;
  /** The session calls this before moving on to reflection: flush the open draft */
  flushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** Session completion waits for the answer sheet to close, including stopping any recording. */
  onOpenChange?: (open: boolean) => void;
  /** Session music yields the audio focus to recording and draft playback. */
  onAudioBusyChange?: (busy: boolean) => void;
};

const MIN_UI_RECORDING_MILLIS = 1_500;
const REST_SNAP_FRACTION = 0.62;
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

// Answer sheet: the answer text and the voice recording counter. The
// recordings themselves live in a separate sheet on top (RecordingsSheet).
// Opens on the current question; the draft is loaded from the saved answer.
// The session screen re-renders every second for its timer. The sheet does not
// need that: it updates from its own (stable) props and store subscriptions.
export default React.memo(AnswerSheet);

function AnswerSheet({
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
  // subscribe only to what is needed — no re-rendering the sheet on timer ticks
  const questions = useSession((st) => st.questions);
  const qIndex = useSession((st) => st.qIndex);
  const saveAnswerToStore = useSession((st) => st.saveAnswer);
  const [text, setText] = useState('');
  const answerInputRef = useRef<React.ComponentRef<typeof KeyboardSheetTextInput>>(null);
  const [recs, setRecs] = useState<RecordingDraft[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Transcripts render collapsed to three lines; an expanded one is read in full.
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
  const openSheetRef = useRef(false); // actual sheet state (for keyboard listeners)
  const [saveFlight] = useState(createAnswerSaveFlight);
  const recsRef = useRef<RecordingDraft[]>([]);
  const pendingTranscriptions = useRef(
    new Map<number, { controller: AbortController; promise: Promise<void> }>(),
  );
  const pendingConsentRecording = useRef<RecordingDraft | null>(null);
  // Keep keyboardDidHide from snapping the sheet back to 62% once recording starts.
  const recordingOverlayActiveRef = useRef(false);
  // Only these files belong to the current unsaved draft. Recordings loaded
  // from the saved answer must not be deleted when editing is cancelled.
  const unsavedRecordingUris = useRef(new Set<string>());
  // qIndex is captured when the sheet opens: while the person writes, the store
  // index may move (navigation, generation) — the answer must land under its own question
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
  // Native recorderState updates with a delay and cannot serve as a mutex.
  // The pure coordinator holds the phase synchronously; state only mirrors it in the UI.
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
  // The sheet's busy flag derives from its own sources: a late completion of
  // one of them must not clear busyness held by a recording or other audio.
  const releaseAudioBusyIfIdle = () => {
    if (isAnswerAudioIdle({
      recordingPhase: recordingOperation.getPhase(),
      draftActive: activeDraftIdRef.current !== null,
      cueActive: limitCueActiveRef.current,
    })) onAudioBusyChange?.(false);
  };
  const cancelLimitCue = (pausePlayer = true) => {
    limitCueCompletionRef.current?.();
    limitCueCompletionRef.current = null;
    if (pausePlayer && nativeAudioMountedRef.current) limitCuePlayer.pause();
    limitCueActiveRef.current = false;
    return limitCueOperation.cancel();
  };

  const playLimitCue = async () => {
    const generation = limitCueOperation.begin(() =>
      audioModeCoordinator.acquireSession(),
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
      // A cancelled cue has already reset the flag; a new cue holds its own.
      if (limitCueOperation.isCurrent(generation)) limitCueActiveRef.current = false;
      if (nativeAudioMountedRef.current) limitCuePlayer.pause();
      await limitCueOperation.complete(generation);
      releaseAudioBusyIfIdle();
    }
  };

  // The second snap point is the full height below the status bar (topInset):
  // the keyboard effect below raises the sheet there so the input field and
  // buttons stay visible. KeyboardSheet owns the body height.
  const [open, setOpen] = useState(false);
  const snapPoints = useMemo(() => [`${REST_SNAP_FRACTION * 100}%`, '100%'], []);
  const questionRef = useRef<Text>(null);

  // The screen behind the sheet is hidden from screen readers, and focus from
  // the "Answer" button would go nowhere — move it to the question.
  useEffect(() => {
    if (open && questionRef.current) AccessibilityInfo.sendAccessibilityEvent(questionRef.current, 'focus');
  }, [open]);
  const keyboard = useKeyboardLayout();
  const keyboardOpen = keyboard.visible;
  const keyboardShown = keyboardShowing(keyboard);
  const [inputFocused, setInputFocused] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const landscapeTablet = isTablet() && windowWidth > windowHeight;
  // The snap point the keyboard requires (null — the person decides).
  const keyboardSnap = useRef<KeyboardSnap>(null);
  // The person is holding the sheet handle (touch not yet released or turned into a gesture).
  const handlePressed = useRef(false);
  // Continuous sheet index from Gorhom: an integer value means the sheet is settled.
  const sheetIndex = useSharedValue(-1);

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
          reportTranscriptionFailure('answer', error);
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

  // The only way to edit a transcript is to move it into the answer and edit
  // it there. The recordings sheet closes for this — otherwise the text lands
  // in the field behind it and it is unclear whether the action worked.
  const appendTranscriptToAnswer = useCallback((transcript: string) => {
    const addition = transcript.trim();
    if (!addition) return;
    setText((current) => (current.trim() ? `${current.trim()}\n\n${addition}` : addition));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recSheetRef.current?.close();
  }, []);

  // the current question's draft is loaded BEFORE the sheet is shown: loading
  // it in onChange lets the previous question's content flash on open
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
      // Expo may have already released shared objects before this effect's cleanup.
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
        // useAudioRecorder releases the native recorder itself on unmount.
        recordingAudioModeLeaseRef.current?.release();
        recordingAudioModeLeaseRef.current = null;
        observeRelease(releaseRecordingSession());
        onAudioBusyChange?.(false);
      } else if (phase === 'stopping') {
        // An unfinished stop releases the lease itself once the native layer responds.
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
        releaseAudioBusyIfIdle();
      }
    };
  }, [abortAllTranscriptions, onAudioBusyChange, recordingOperation]);

  // Snap is the form's policy, not geometry (see keyboardSnapTarget). Every
  // keyboard or focus change requests a target point (reconcileKeyboardSnap),
  // and full height is rechecked each time the sheet settles
  // (settledKeyboardSnapRequest). Gorhom fires onChange only when the index
  // changes, so settling is observed via animatedIndex: it becomes an integer
  // after motion. A closing keyboard no longer requires full height
  // (keyboardShowing): the sheet lowers together with it. KeyboardSheet owns
  // the body height. The synchronous close flag protects saving from a late didHide.
  const requestSnap = useCallback((step: { request: number | null; target: KeyboardSnap }) => {
    keyboardSnap.current = step.target;
    if (step.request !== null) sheetRef.current?.snapToIndex(step.request);
  }, [sheetRef]);
  const releaseHandle = useCallback((dragged: boolean) => {
    if (!handlePressed.current) return;
    handlePressed.current = false;
    if (!openSheetRef.current) return;
    requestSnap(keyboardSnapOnHandleRelease(keyboardSnap.current, dragged));
  }, [requestSnap]);
  const onSheetSettled = useCallback((index: number) => {
    if (!openSheetRef.current) return;
    const request = settledKeyboardSnapRequest(keyboardSnap.current, index);
    if (request !== null) sheetRef.current?.snapToIndex(request);
  }, [sheetRef]);
  useAnimatedReaction(
    () => (Number.isInteger(sheetIndex.value) ? sheetIndex.value : null),
    (settled, previous) => {
      if (settled !== null && settled !== previous) scheduleOnRN(onSheetSettled, settled);
    },
    [onSheetSettled],
  );
  useEffect(() => {
    const target = keyboardSnapTarget(keyboardSnap.current, {
      open: open && openSheetRef.current,
      keyboardShowing: keyboardShown,
      inputFocused,
      recording: recordingOverlayActiveRef.current,
    });
    requestSnap(reconcileKeyboardSnap(target, handlePressed.current));
  }, [open, keyboardShown, inputFocused, requestSnap]);

  const startRecording = async () => {
    if (!recordingSheetOpenRef.current) return;

    const attempt = recordingOperation.beginStart();
    if (!attempt) return;
    cancelDraftPlayback();
    observeRelease(cancelLimitCue());
    // The recording overlay must not remain under an open keyboard.
    dismissKeyboard();
    // First stop music/draft playback synchronously, then change the global
    // audio mode: otherwise music can leak into the start of the voice recording.
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
        // Cancelling the start matters more than best-effort cleanup of an empty file.
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
      sessionLease = audioModeCoordinator.acquireSession();
      recordingSessionLeaseRef.current = sessionLease;
      audioModeLease = audioModeCoordinator.acquireRecording(setAudioModeAsync, {
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioModeLease.ready;
      recordingAudioModeLeaseRef.current = audioModeLease;
      audioModeEnabled = true;
      if (!startIsCurrent()) return;
      // the preset is mandatory: without options the recorder reuses one URL
      // and each new recording overwrites the previous file
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      prepared = true;
      if (!startIsCurrent()) {
        if (!nativeAudioMountedRef.current) {
          nativeStopConfirmed = true; // The native recorder was already deleted by the Expo hook.
          return;
        }
        // Android forbids a repeat prepare until the previous MediaRecorder is
        // reset. stop() after prepare releases it even without record().
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
      // The sheet may have been closed programmatically between the last await
      // and record(). Then kill the native recording immediately and create no draft.
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
            // Cancelling the start matters more than best-effort cleanup of a temp file.
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
      // After a successful start, stopRecording restores the mode. In every
      // other outcome (denial, error, dismiss) restore it here.
      try {
        if (!started) {
          // The error may have happened after a successful prepare but before
          // record(). Release the prepared Android recorder for the next attempt.
          if (prepared && !nativeStopConfirmed) {
            if (!nativeAudioMountedRef.current) {
              nativeStopConfirmed = true; // Expo released the recorder on unmount.
            } else {
              try {
                await recorder.stop();
                nativeStopConfirmed = true;
                discardPreparedFile();
              } catch {
                // Without a confirmed stop the lease stays active: playback mode
                // on iOS could cut off a native recorder that is still alive.
                nativeCleanupUncertain = true;
              }
            }
          }
          if (nativeCleanupUncertain && attempt.recoverAsRecording()) {
            // Do not go idle with an unknown native state. Show the stop
            // controls again and keep the recording lease/audio busy.
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
        // A new start must not slip in before the old one has returned the audio mode.
        attempt.finish();
        if (!started) {
          releaseAudioBusyIfIdle();
        }
      }
    }
  };

  // The answer sheet's mic leads to the recordings. With an empty list we
  // record right away: the person tapped the mic to speak, not to stare at emptiness.
  const openRecordings = () => {
    answerInputRef.current?.blur();
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
      // A stop exception does not prove the native recorder stopped. Keep its
      // URI and the recording phase for a visible retry.
      throw error;
    } finally {
      // A native stop error does not confirm the stop. In that case keep the
      // audio focus and overlay until a successful retry, so music does not
      // resume over a potentially ongoing recording.
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
    // All competing calls get the same operation. So the second catch cannot
    // delete a file already saved by the first stop.
    return recordingOperation.runStop((confirm) =>
      performStopRecording(confirm, keepAudioBusy),
    ).catch(() => null);
  };

  const finishLimitedRecording = async (): Promise<boolean> => {
    if (recordingOperation.getPhase() !== 'recording') return true;
    const sheetGeneration = recordingsSheetGenerationRef.current;
    const draft = await stopRecording(true);
    if (!draft) {
      releaseAudioBusyIfIdle();
      return recordingOperation.getPhase() !== 'recording';
    }
    if (
      sheetGeneration !== recordingsSheetGenerationRef.current ||
      !recordingSheetOpenRef.current || !openSheetRef.current
    ) {
      releaseAudioBusyIfIdle();
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
      releaseAudioBusyIfIdle();
    }
    return true;
  };

  // The native counter is only needed while recording; the final length comes from the file.
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
      releaseAudioBusyIfIdle();
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
      audioModeCoordinator.acquireSession(),
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
          releaseAudioBusyIfIdle();
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
            if (status.error) {
              console.warn('Draft recording playback failed', status.error);
              recordDiagnostic('recording_playback_failed', { place: 'answer', reason: 'player_error' });
              setAudioError('components.answers.playbackFailed');
            }
            releaseAudioBusyIfIdle();
          });
          // Android silently ignores play() when the audio session is off: the
          // draft must not stay stuck as "playing". The timer is removed together
          // with the listener on any cancellation, including unmount (ADR-0036).
          const cancelStartWatch = watchNativePlaybackStart({
            readStatus: () => player.currentStatus,
            onFailed: (reason, status) => {
              if (!nativeAudioMountedRef.current || !draftPlaybackOperation.isCurrent(generation)) return;
              console.warn('Draft recording did not start', reason, status.playbackState);
              recordDiagnostic('recording_playback_failed', { place: 'answer', reason });
              cancelDraftPlayback();
              player.pause();
              setPlayingId(null);
              setPausedId(null);
              setAudioError('components.answers.playbackFailed');
              releaseAudioBusyIfIdle();
            },
          });
          draftPlaybackOperation.attachStatus(generation, {
            remove: () => {
              cancelStartWatch();
              subscription.remove();
            },
          });
        }))) {
          if (draftPlaybackOperation.isCurrent(generation)) {
            cancelDraftPlayback();
            releaseAudioBusyIfIdle();
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
        recordDiagnostic('recording_playback_failed', { place: 'answer', reason: 'start_error', errorKind: errorKind(error) });
        cancelDraftPlayback();
        setPausedId(null);
        setAudioError('components.answers.playbackFailed');
        releaseAudioBusyIfIdle();
      });
  };

  const handleRecordingsDismiss = () => {
    if (!nativeAudioMountedRef.current) return;
    recordingsSheetGenerationRef.current += 1;
    observeRelease(cancelLimitCue());
    cancelDraftPlayback();
    player.pause();
    // An active recording is cleared by its own stop below.
    releaseAudioBusyIfIdle();
    setRecordingsSheetOpen(false);
    setPausedId(null);
    recordingSheetOpenRef.current = false;
    // An unfinished start will see the new token after the next await and
    // cannot enable the mic behind the closed sheet.
    recordingOperation.cancelStart();
    setConfirmDeleteId(null);
    if (recordingOperation.getPhase() === 'recording') {
      void stopRecording().then(() => {
        if (recordingOperation.getPhase() !== 'recording') return;
        // Native stop was not confirmed: bring back the mic controls so the
        // recording does not stay hidden behind the closed sheet.
        recordingSheetOpenRef.current = true;
        setRecordingsSheetOpen(true);
        recSheetRef.current?.snapToIndex(0);
      });
    }
    setPlayingId(null);
  };

  const discardUnsavedRecordings = () => {
    for (const uri of unsavedRecordingUris.current) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Cancelling the answer must not break if iOS has already cleaned up the file.
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
        releaseAudioBusyIfIdle();
      }
      pendingTranscriptions.current.get(id)?.controller.abort();
      pendingTranscriptions.current.delete(id);
      const removed = recsRef.current.find((r) => r.id === id);
      if (removed && unsavedRecordingUris.current.delete(removed.uri)) {
        try {
          const file = new File(removed.uri);
          if (file.exists) file.delete();
        } catch {
          // Removal from the list must work even if the file is already unavailable.
        }
      }
      updateRecs((current) => current.filter((r) => r.id !== id));
      return;
    }
    setConfirmDeleteId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  // A repeated call during a recording waits for it instead of recording again.
  const save = (mode: AnswerSaveMode) => saveFlight.run(() => runSave(mode));

  const runSave = async (mode: AnswerSaveMode) => {
    setSaving(true);
    try {
      // Blur before the consent dialog: when it closes, iOS might otherwise
      // restore the keyboard above the already-closed answer sheet.
      answerInputRef.current?.blur();
      dismissKeyboard();
      // an active recording must not silently continue after saving
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
        // The draft sheet stays open: the answer is not considered saved.
        recordDiagnostic('answer_save_failed', { errorKind: errorKind(error) });
        Alert.alert(t('components.answers.answerSaveFailed'), t('screens.retryMessage'), [
          { text: t('screens.understood') },
        ]);
        return;
      }
      // After saving, the files belong to the answer and are no longer a draft.
      unsavedRecordingUris.current.clear();
      // Clear the flag before dismiss: willHide may request a snap while
      // close() is still running, and the listener would return the sheet to
      // the lower snap point instead of closing it
      openSheetRef.current = false;
      dismissKeyboard();
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

  // "Cancel" asks for confirmation: unsaved content is never discarded silently
  const requestClose = () => {
    if (saveFlight.isActive()) return;
    const hasContent = !!text.trim() || recs.length > 0;
    if (!hasContent || confirmCancel) {
      if (cancelTimer.current) clearTimeout(cancelTimer.current);
      setConfirmCancel(false);
      abortAllTranscriptions();
      discardUnsavedRecordings();
      openSheetRef.current = false; // see the comment in save()
      dismissKeyboard();
      sheetRef.current?.close();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // a label change on the focused button is not announced on its own
    AccessibilityInfo.announceForAccessibility(t('components.answers.confirmClose'));
    setConfirmCancel(true);
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    cancelTimer.current = setTimeout(() => setConfirmCancel(false), 3000);
  };

  // auto-save when the timer expires: the draft must not be lost
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

  // While the sheet holds a draft, the gesture and backdrop tap must not bypass
  // the two-step confirmation on the "Cancel" button.
  const hasUnsavedContent = text.length > 0 || recs.length > 0;

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
        pressBehavior={hasUnsavedContent ? 'none' : 'close'}
        // The backdrop has no localized label; "Cancel" and the escape gesture close the sheet.
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
        // Once the Gorhom gesture starts, it cancels the React Native touch:
        // a cancel is a drag, a release is a plain tap
        // (keyboardSnapOnHandleRelease).
        onTouchStart={() => { handlePressed.current = true; }}
        onTouchEnd={() => releaseHandle(false)}
        onTouchCancel={() => releaseHandle(true)}
        onStartShouldSetResponder={() => {
          dismissKeyboard();
          return false;
        }}
      >
        <View style={styles.handle} />
      </View>
    ),
    [styles, releaseHandle],
  );

  const recording = recordingPhase === 'recording' || recordingPhase === 'stopping';

  // Pause keeps the position and shows it on the same card.
  const playProgress =
    (playingId !== null || pausedId !== null) && playerStatus.duration > 0
      ? Math.min(playerStatus.currentTime / playerStatus.duration, 1)
      : 0;

  const questionText = questions[answerIndexRef.current] ?? questions[qIndex] ?? '';
  const questionHeader = (
    <QuestionHeader question={questionText} questionRef={questionRef} testID="answer-question" />
  );

  const actions = (
    <View style={[styles.footerContent, landscapeTablet && styles.footerGrid]}>
      {landscapeTablet && <View style={styles.questionColumn} />}
      <View style={[styles.actionsRow, landscapeTablet && styles.footerActionsLandscape]}>
        {/* the mic is a square in the same row as the buttons, like the
            navigation of the companion card. The badge shows how many
            recordings exist: they live in a separate sheet and are not
            visible from the answer. */}
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
          testID="answer-cancel-button"
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
  );

  return (
    <>
    <KeyboardSheet
      ref={sheetRef}
      keyboardSnapPosition={0}
      keyboardRestFraction={1 - REST_SNAP_FRACTION}
      animatedIndex={sheetIndex}
      index={-1}
      snapPoints={snapPoints}
      // without this, v5 mixes in a "content-based" snap point and the indices shift
      enableDynamicSizing={false}
      // Swipe is available only for an empty sheet. Otherwise it can be closed
      // solely via "Cancel" → confirm-close or "Save".
      enablePanDownToClose={!hasUnsavedContent}
      // Content panning is disabled: otherwise a vertical drag inside the
      // answer field moves the sheet instead of scrolling the text. The sheet
      // is dragged by its handle.
      enableContentPanningGesture={false}
      onChange={async (i) => {
        if (!nativeAudioMountedRef.current) return;
        setOpen(i >= 0);
        const editing = i >= 0;
        openSheetRef.current = editing;
        if (editing) onOpenChange?.(true);
        if (i < 0) {
          // A lost handle release must not delay keyboard dismissal.
          handlePressed.current = false;
          recordingsSheetGenerationRef.current += 1;
          observeRelease(cancelLimitCue());
          cancelDraftPlayback();
          player.pause();
          setPausedId(null);
          // Cancel the start before the first await: the recording cannot start
          // after the parent sheet has begun closing.
          recordingSheetOpenRef.current = false;
          setRecordingsSheetOpen(false);
          recordingOperation.cancelStart();
        }
        // Closed (swipe/button) during a recording — wait for the shared stop.
        if (
          i < 0 &&
          (recordingOperation.getPhase() === 'recording' ||
            recordingOperation.getPhase() === 'stopping')
        ) {
          await stopRecording();
          if (recordingOperation.getPhase() === 'recording') {
            // If the native stop failed, closing is unsafe: reopen both sheets
            // and keep the visible retry-stop button.
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
          releaseAudioBusyIfIdle();
          setConfirmCancel(false);
          discardUnsavedRecordings();
          if (!openSheetRef.current) onOpenChange?.(false);
        }
      }}
      // By default the sheet's content container is a single accessibility
      // element and everything inside is hidden from VoiceOver and Maestro.
      // Expose the children.
      accessible={false}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      topInset={insets.top}
      backgroundStyle={styles.sheetBg}
      footer={actions}
      footerHidden={recordingsSheetOpen}
      footerStyle={landscapeTablet ? styles.landscapeFooter : undefined}
      onAccessibilityEscape={requestClose}
    >
      {/* In the tablet's landscape window the question sits next to the form,
          leaving the field height above the keyboard. A long question scrolls separately. */}
      <KeyboardSheetBody
        {...screenReaderHiddenProps(!open || recordingsSheetOpen)}
        // The sheet's side gutters also dismiss the keyboard without intercepting input.
        onStartShouldSetResponder={() => {
          if (keyboardOpen) dismissKeyboard();
          return false;
        }}
      >
        <View style={[styles.content, landscapeTablet && styles.contentLandscape]}>
          {landscapeTablet ? (
            <ScrollView
              style={styles.questionColumn}
              contentContainerStyle={styles.questionColumnContent}
              keyboardShouldPersistTaps="handled"
            >
              {questionHeader}
            </ScrollView>
          ) : questionHeader}

          <View style={styles.form}>
            {/* The field takes the remaining height and scrolls itself: the
                cursor always stays in view while typing. */}
            <KeyboardSheetTextInput
              ref={answerInputRef}
              testID="answer-input"
              editable={!recordingsSheetOpen}
              value={text}
              onChangeText={setText}
              multiline
              placeholder={t('components.answers.placeholder')}
              placeholderTextColor={colors.placeholder}
              accessibilityLabel={t('components.answers.placeholder')}
              style={styles.input}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </View>
        </View>
      </KeyboardSheetBody>
    </KeyboardSheet>

    <RecordingsSheet
      sheetRef={recSheetRef}
      visible={recordingsSheetOpen}
      question={questionText}
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
  // Gorhom measures the handle and reserves it in the available area.
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
  // ADR-0012: the column holds the line measure. Without it the tablet's
  // answer line ran ~70 chars and "Save" stretched to the full window width.
  content: {
    flex: 1,
    ...column(),
    paddingHorizontal: screenGutter(),
    // Together with the footer's top padding (sc(10)) — sc(14) from field to buttons.
    paddingBottom: sc(4),
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
  // The header is not squeezed by scrolling: the question is the answer's
  // context and must stay visible. flexShrink is a last resort for a very
  // long question on a short screen.
  input: {
    // The whole sheet body minus the question and buttons. A long answer
    // scrolls inside the field, so the box does not grow and pushes nothing out.
    flex: 1,
    minHeight: sc(72),
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
  actionDisabled: { opacity: 0.4 },
  // The recording count sits on the mic's corner: the cards are visible only
  // in the recordings sheet, and without the badge it is unclear any exist.
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
  },
  footerContent: { width: '100%' },
  footerGrid: { flexDirection: 'row', gap: sc(24) },
  footerActionsLandscape: { flex: 1 },
  landscapeFooter: { maxWidth: 1120, paddingHorizontal: sc(24) },
  cancelBtn: {
    // same height as the companion card buttons (CompanionDock/cardBtnSize)
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
