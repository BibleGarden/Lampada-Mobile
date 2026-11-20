import { create } from 'zustand';
import * as ai from './ai';
import { replyTexts } from './answerContext';
import * as db from './db';
import {
  ScriptureCatalogUnavailableError,
  ScriptureDefaultUnavailableError,
  answerContextAllowedNow,
  coreAiAllowedNow,
  ensureScripturePreferences,
  ensureSettingsLoaded,
  useSettings,
} from './settings';
import type { ScripturePreferences } from './scripturePreferences';
import type { ScriptureLanguage } from './scripture';
import { createOneAheadPool } from './oneAheadPool';
import { rememberShownQuestion, wasQuestionShown } from './questionNovelty';
import {
  buildScriptureRequest,
  toScriptureDisplay,
  type ScriptureDisplay,
} from './scripture';
import {
  fetchScriptureBooks,
  selectScripture,
  selectScriptureOnce,
  type ScriptureSelectError,
} from './scriptureClient';
import * as scriptureRepository from './scriptureRepository';
import { createSingleFlight } from './singleFlight';
import { mergeOfflineTrail, shouldDeferLoadedNext } from './scriptureSessionState';
import { adjustSessionTimer, sessionTimerSnapshot } from './sessionTimer';
import { DEFAULT_PRAYER_MINUTES, MAX_PRAYER_MINUTES } from './prayerDuration';
import {
  startPrayerSystemTimer,
  stopPrayerSystemTimer,
  updatePrayerSystemTimer,
} from './prayerSystemTimer';

// Session logic carried over from the prototype.
//
// Questions: a linear "trail" of opened questions + a "frontier" (the current
// unanswered one). ◀ ▶ move only over opened items (0..answeredCount). On the
// frontier the right button:
//  - answered → open the next question from the pool;
//  - unanswered → replace the question in place from the same pool.
// A ready slot is shown immediately; a pending slot waits for its request.
//
// Scripture: the same mechanics, but the "trail" grows by a heart (favourite),
// not by an answer.

export type RecordingDraft = {
  id: number;
  uri: string;
  durationSec: number;
  transcript: string | null;
  transcriptState?: 'idle' | 'loading' | 'error';
  transcriptError?: import('./transcriptionErrors').TranscriptionErrorCode;
};

export type Answer = { text: string; recordings: RecordingDraft[] };

/** The scripture triple frozen for the session. */
export type ScriptureSelection = {
  language: ScriptureLanguage;
  translation: number;
  voice: number;
};

const selectionFromPreferences = (preferences: ScripturePreferences): ScriptureSelection => ({
  language: preferences.language,
  translation: preferences.translationCode,
  voice: preferences.voiceCode,
});

type SessionState = {
  // setup
  topic: string;
  minutes: number; // 0 = no timer

  // session runtime
  sessionId: number | null;
  questions: string[];
  shownQuestions: string[];
  skippedQuestions: string[];
  questionSources: ai.QuestionSource[];
  qIndex: number;
  answeredCount: number;
  answers: Record<number, Answer>;
  generating: boolean;

  scrList: ScriptureDisplay[]; // the trail actually shown in the current session
  scrIndex: number; // position in scrList
  scrFav: string[]; // canonical IDs of favourite server records
  // Snapshot of the selection taken when entering the session; null until the catalog confirms the first selection.
  scriptureSelection: ScriptureSelection | null;
  scrStatus: 'idle' | 'loading' | 'ready' | 'retrying' | 'error' | 'offline_fallback';
  // catalog_unavailable — the catalog did not respond; no_default_bible — no
  // Bible with narration for the interface language; selection_failed — an
  // on-device failure.
  scrError:
    | 'not_configured'
    | 'unavailable'
    | 'catalog_unavailable'
    | 'no_default_bible'
    | 'selection_failed'
    | null;

  dockMode: 'question' | 'scripture';
  musicOn: boolean;

  remaining: number | null; // seconds; null = no timer
  elapsed: number;
  startedAtMs: number | null;
  endsAtMs: number | null;

  // reflect
  reflectQ: string;
  reflectSource: ai.QuestionSource | null;
  reflectGenerating: boolean;
  takeaway: string;

  streak: db.Streak;
};

type SessionActions = {
  setTopic: (t: string) => void;
  setMinutes: (m: number) => void;
  incMinutes: () => void;
  decMinutes: () => void;

  prepareThreshold: () => void;
  prepareReflect: () => void;
  enterSession: () => Promise<void>;
  resumeSession: () => void;
  tick: (nowMs?: number) => void;
  /** Save the current prayer time when the app leaves the active state. */
  checkpointElapsed: () => void;
  adjustTimer: (deltaMin: number) => void;

  prevQuestion: () => void;
  nextQuestion: () => Promise<void>;
  jumpQuestion: (pos: number) => void;
  /** Writes the answer to SQLite first; a write error is thrown and memory stays unchanged. */
  saveAnswer: (questionIndex: number, text: string, recordings: RecordingDraft[]) => Promise<void>;

  prevScripture: () => void;
  nextScripture: () => Promise<void>;
  jumpScripture: (pos: number) => void;
  toggleFav: () => void;
  retryScripture: () => Promise<void>;

  setDockMode: (m: 'question' | 'scripture') => void;
  toggleMusic: () => void;

  finish: () => Promise<void>;
  complete: (takeaway: string) => Promise<void>;
  reset: () => void;
  loadStreak: () => Promise<void>;
};

const isAnswered = (a: Answer | undefined) =>
  !!(a && (a.text.trim() || a.recordings.length));

// The elapsed prayer time is saved once a minute and when going to the
// background: an interrupted prayer stays in the journal with its duration and
// counts for the day (ADR-0042). The first checkpoint is after a minute: a
// prayer opened and immediately abandoned with no answers never reaches the
// journal or the streak.
const ELAPSED_CHECKPOINT_SEC = 60;
// Kept outside the store state: the checkpoint causes no re-renders.
let savedElapsed: { sessionId: number | null; elapsed: number } = { sessionId: null, elapsed: 0 };

const saveElapsedCheckpoint = (s: SessionState, anyProgress: boolean) => {
  const { sessionId, elapsed } = s;
  if (sessionId === null || elapsed < ELAPSED_CHECKPOINT_SEC) return;
  const saved = savedElapsed.sessionId === sessionId ? savedElapsed.elapsed : 0;
  const due = anyProgress
    ? elapsed > saved
    : Math.floor(elapsed / ELAPSED_CHECKPOINT_SEC) > Math.floor(saved / ELAPSED_CHECKPOINT_SEC);
  if (!due) return;
  savedElapsed = { sessionId, elapsed };
  void db.saveElapsedCheckpoint(sessionId, elapsed).catch((error) => {
    console.error('Could not save the prayer time checkpoint', error);
    db.recordDiagnostic('elapsed_checkpoint_failed', { sessionId, reason: db.errorKind(error) });
  });
};

const reportSystemTimerError = (action: string, error: unknown) => {
  console.warn(
    `Could not ${action} the prayer system timer`,
    error instanceof Error ? error.message : error,
  );
};

// Replies for the prompt — only with a separate answer-context consent;
// without it, answers and ready transcripts never leave the device.
const answersForAi = (answers: Record<number, Answer>) =>
  answerContextAllowedNow() ? answers : {};

let prepareToken = 0;
let reflectToken = 0;
// One-shot behavior of the forced enterSession error hook (EXPO_PUBLIC_FORCE_SESSION_ERROR).
let forcedSessionErrorSpent = false;
let scriptureToken = 0;
let scriptureAbortController: AbortController | null = null;
let firstQuestionFetch: {
  topic: string;
  language: string;
  promise: Promise<ai.GeneratedQuestion | null>;
  result?: ai.GeneratedQuestion | null;
} | null = null;

// A ready slot is shown synchronously. While a slot is still pending, the
// button waits for the request already in flight; a new refill starts only
// after the reveal.
const questionPool = createOneAheadPool<ai.GeneratedQuestion | null>();
const reflectPool = createOneAheadPool<ai.GeneratedQuestion | null>();

type ScriptureLoadError = ScriptureSelectError;

type ScriptureLoadResult =
  | { ok: true; display: ScriptureDisplay }
  | { ok: false; error: ScriptureLoadError };

const scriptureSingleFlight = createSingleFlight();
let scripturePrefetch: {
  sessionId: number;
  promise: Promise<ScriptureLoadResult>;
} | null = null;

const runScriptureExclusive = (load: () => Promise<ScriptureLoadResult>) =>
  scriptureSingleFlight.run(load);

// The language is part of the buffer key and passed as default_language to completePrayerContent.
const poolKey = (
  s: SessionState,
  index: number,
  answers: Record<number, Answer> = s.answers,
) => JSON.stringify([s.sessionId, index, s.topic, s.questions, skippedForAi(s, answers), answersForAi(answers), useSettings.getState().uiLanguage]);

// The current unanswered question is already shown: prefetch must exclude it
// too. Real answers are checked before the privacy gate, including voice not
// yet transcribed.
const skippedForAi = (s: SessionState, answers = s.answers) => [
  ...s.skippedQuestions,
  ...s.questions.filter((question, index) => question.trim() && !isAnswered(answers[index])),
];

const localQuestion = (shown: string[], stage: 'next' | 'reflect'): ai.GeneratedQuestion => {
  const text = ai.pickFallbackQuestion(shown, stage);
  if (wasQuestionShown(text, shown) && ai.hasUnseenFallbackQuestion(shown, stage)) {
    throw new Error('Local question pool returned a repeated question while unseen questions remain');
  }
  return { text, source: 'fallback' };
};

const prepareQuestion = (
  s: SessionState,
  index: number,
  answers: Record<number, Answer> = s.answers,
  prefetch = true,
) => {
  if (s.sessionId === null) return null;
  const key = poolKey(s, index, answers);
  return questionPool.prepare(key, () =>
    ai.generateQuestion(s.topic, s.questions, answersForAi(answers), skippedForAi(s, answers), prefetch, answers),
  );
};

const reflectKey = (s: SessionState) =>
  JSON.stringify([s.sessionId, s.topic, s.questions, skippedForAi(s), answersForAi(s.answers), useSettings.getState().uiLanguage]);

const prepareReflectQuestion = (s: SessionState, prefetch = true) => {
  if (s.sessionId === null) return null;
  const key = reflectKey(s);
  return reflectPool.prepare(key, () =>
    ai.generateReflectQuestion(s.topic, s.questions, answersForAi(s.answers), skippedForAi(s), prefetch, s.answers),
  );
};

const ensureBookNames = async (
  translation: number,
  signal: AbortSignal,
): Promise<Record<number, string> | null> => {
  let names = await scriptureRepository.getScriptureBookNames(translation);
  if (Object.keys(names).length) return names;
  const books = await fetchScriptureBooks(translation, { signal });
  if (books?.length) {
    await scriptureRepository.replaceScriptureBooks(translation, books);
    names = Object.fromEntries(books.map((book) => [book.bookNumber, book.name]));
  }
  return Object.keys(names).length ? names : null;
};

const loadScriptureForState = async (
  s: SessionState,
  foreground: boolean,
  signal: AbortSignal,
): Promise<ScriptureLoadResult> => {
  if (signal.aborted) return { ok: false, error: { kind: 'cancelled' } };
  const selection = s.scriptureSelection;
  if (!selection) throw new Error('Scripture selection is not confirmed');
  const shownCanonicalIds = await scriptureRepository.getScriptureHistory();
  const request = buildScriptureRequest({
    language: selection.language,
    translation: selection.translation,
    topic: s.topic,
    replies: replyTexts(s.answers),
    shareTopic: coreAiAllowedNow(),
    shareReplies: coreAiAllowedNow() && answerContextAllowedNow(),
    shownCanonicalIds,
  });
  const result = foreground
    ? await selectScripture(request, { signal })
    : await selectScriptureOnce({ ...request, prefetch: true }, { signal });
  if (!result.ok) return result;
  const bookNames = await ensureBookNames(result.data.passage.translation, signal);
  if (!bookNames?.[result.data.passage.book_number]) {
    return { ok: false, error: { kind: signal.aborted ? 'cancelled' : 'unavailable', status: 503 } };
  }
  const display = toScriptureDisplay(result.data, bookNames);
  await scriptureRepository.cacheScripture(display);
  return { ok: true, display };
};

const initial: SessionState = {
  topic: '',
  minutes: DEFAULT_PRAYER_MINUTES,
  sessionId: null,
  shownQuestions: [],
  skippedQuestions: [],
  questions: ai.getCuratedQuestions(),
  questionSources: ai.getCuratedQuestions().map(() => 'fallback'),
  qIndex: 0,
  answeredCount: 0,
  answers: {},
  generating: false,
  scrList: [],
  scrIndex: 0,
  scrFav: [],
  scriptureSelection: null,
  scrStatus: 'idle',
  scrError: null,
  dockMode: 'question',
  musicOn: false,
  remaining: DEFAULT_PRAYER_MINUTES * 60,
  elapsed: 0,
  startedAtMs: null,
  endsAtMs: null,
  reflectQ: '',
  reflectSource: null,
  reflectGenerating: false,
  takeaway: '',
  streak: { count: 0, prayedToday: false, week: Array(7).fill(false) },
};

export const useSession = create<SessionState & SessionActions>((set, get) => ({
  ...initial,

  setTopic: (topic) => set({ topic }),
  setMinutes: (minutes) => set({ minutes }),
  incMinutes: () =>
    set((s) => {
      if (s.minutes === 0) return { minutes: 5 };
      const step = s.minutes < 5 ? 1 : 5;
      return { minutes: Math.min(s.minutes + step, MAX_PRAYER_MINUTES) };
    }),
  decMinutes: () =>
    set((s) => {
      if (s.minutes === 0) return s;
      const step = s.minutes <= 5 ? 1 : 5;
      return { minutes: Math.max(s.minutes - step, 1) };
    }),

  prepareThreshold: () => {
    const { topic } = get();
    // the token discards stale promise results: re-entering the threshold with
    // a different topic or reset() makes the old answer obsolete
    const token = ++prepareToken;
    // only the first question is prepared in advance: the rest are generated
    // during the prayer from live answers (if the person consented).
    // The result applies only before the session starts: a late question must
    // not overwrite a prayer already in progress
    const promise = ai.generateFirstQuestion(topic, true);
    const fetch: NonNullable<typeof firstQuestionFetch> = { topic, promise, language: useSettings.getState().uiLanguage };
    firstQuestionFetch = fetch;
    promise.then((q) => {
      if (firstQuestionFetch === fetch) fetch.result = q;
      if (q && token === prepareToken) {
        set((st) =>
          st.sessionId === null
            ? { questions: [q.text], questionSources: [q.source] }
            : st,
        );
      }
    });
  },

  prepareReflect: () => {
    prepareReflectQuestion(get());
  },

  enterSession: async () => {
    const { topic, minutes } = get();
    reflectToken++;
    // E2E test hook: a build with EXPO_PUBLIC_FORCE_SESSION_ERROR=1 fails entry
    // once on the "STG" marker topic, reproducing the threshold's
    // generic-catch path (app/threshold.tsx) without an external SQLite lock —
    // with WAL (lib/db.ts) that no longer works. The marker topic keeps the
    // hook from breaking other scenarios in the same build.
    if (
      process.env.EXPO_PUBLIC_FORCE_SESSION_ERROR === '1'
      && topic.startsWith('STG')
      && !forcedSessionErrorSpent
    ) {
      forcedSessionErrorSpent = true;
      throw new Error('Forced session start failure (e2e hook)');
    }
    // Entry does not depend on the network. While the first question is being
    // prepared, the question card shows a spinner; the fallback appears only
    // when the AI layer returned it due to an explicit error.
    const fetch: NonNullable<typeof firstQuestionFetch> =
      firstQuestionFetch?.topic === topic && firstQuestionFetch.language === useSettings.getState().uiLanguage
        ? firstQuestionFetch
        : { topic, promise: ai.generateFirstQuestion(topic), language: useSettings.getState().uiLanguage };
    firstQuestionFetch = fetch;
    const firstQuestion = fetch.result;
    // Remember the duration the prayer starts with: the next setup screen
    // opens with it. Extending the timer mid-prayer does not change it — only
    // a choice on the setup screen lands here. Save before the journal write:
    // a save failure leaves no session behind, and a repeated start creates
    // no second one. If session creation fails instead, a remembered but
    // unstarted duration is harmless.
    await useSettings.getState().setPrayerMinutes(minutes);
    // The start moment is taken once: both the journal record
    // (sessions.started_at) and the streak day (ADR-0033) are dated by it;
    // otherwise near midnight they could land on different days.
    const startedAtMs = Date.now();
    const [sessionId, favoriteScriptures] = await Promise.all([
      db.createSession(topic, minutes, startedAtMs),
      ensureSettingsLoaded().then(() => scriptureRepository.getFavoriteScriptures()),
    ]);
    // An unconfirmed first Bible selection does not delay entry: the scripture
    // block will confirm it from the catalog itself or show an error with a
    // retry.
    const scripturePreferences = useSettings.getState().scripturePreferences;
    // a pending first-question generation from the threshold no longer applies
    prepareToken++;
    firstQuestionFetch = null;
    questionPool.invalidate();
    reflectPool.invalidate();
    // After a data wipe, session ids start over: an old checkpoint must not
    // suppress saving a new prayer with the same id.
    savedElapsed = { sessionId, elapsed: 0 };
    set({
      sessionId,
      questions: [firstQuestion?.text ?? ''],
      shownQuestions: firstQuestion ? [firstQuestion.text] : [],
      skippedQuestions: [],
      questionSources: [firstQuestion?.source ?? 'ai'],
      qIndex: 0,
      answeredCount: 0,
      answers: {},
      generating: !firstQuestion,
      scrList: [],
      scrIndex: 0,
      scrFav: favoriteScriptures.flatMap((favorite) =>
        favorite.canonicalId ? [favorite.canonicalId] : [],
      ),
      scriptureSelection: scripturePreferences ? selectionFromPreferences(scripturePreferences) : null,
      scrStatus: 'loading',
      scrError: null,
      dockMode: 'question',
      musicOn: false,
      remaining: minutes === 0 ? null : minutes * 60,
      elapsed: 0,
      startedAtMs,
      endsAtMs: minutes === 0 ? null : startedAtMs + minutes * 60_000,
      reflectQ: '',
      reflectSource: null,
      reflectGenerating: false,
    });
    const systemTimer =
      minutes === 0
        ? null
        : { startedAtMs, endsAtMs: startedAtMs + minutes * 60_000 };
    void (systemTimer
      ? startPrayerSystemTimer(systemTimer)
      : stopPrayerSystemTimer()
    ).catch((error) => reportSystemTimerError('start', error));
    scriptureAbortController?.abort();
    scriptureAbortController = new AbortController();
    const currentScriptureToken = ++scriptureToken;
    scripturePrefetch = null;
    void loadFirstScripture(sessionId, currentScriptureToken, false);
    if (firstQuestion) {
      // The first one-ahead question starts preparing right after entry.
      prepareQuestion(get(), 0);
      return;
    }

    void fetch.promise.then(async (question) => {
      if (get().sessionId !== sessionId) return;
      if (!question) question = await ai.generateFirstQuestion(topic);
      if (!question || get().sessionId !== sessionId) return;
      set({
        questions: [question.text],
        shownQuestions: [question.text],
        questionSources: [question.source],
        generating: false,
      });
      prepareQuestion(get(), 0);
    });
  },

  resumeSession: () => {
    const s = get();
    if (s.sessionId === null || s.startedAtMs === null) return;
    const nowMs = Date.now();
    const remaining = s.minutes === 0 ? null : s.minutes * 60;
    const endsAtMs = remaining === null ? null : nowMs + remaining * 1_000;
    // Return to the same prayer: answers, passages, and positions are kept.
    // A late closing question from the completion screen no longer applies.
    reflectToken++;
    set({
      remaining,
      endsAtMs,
      elapsed: Math.max(s.elapsed, sessionTimerSnapshot(s.startedAtMs, s.endsAtMs, nowMs).elapsed),
      reflectGenerating: false,
    });
    void (endsAtMs === null
      ? stopPrayerSystemTimer()
      : startPrayerSystemTimer({ startedAtMs: nowMs, endsAtMs })
    ).catch((error) => reportSystemTimerError('resume', error));
  },

  tick: (nowMs = Date.now()) => {
    set((s) => {
      if (s.startedAtMs === null) return s;
      const snapshot = sessionTimerSnapshot(s.startedAtMs, s.endsAtMs, nowMs);
      return {
        elapsed: Math.max(s.elapsed, snapshot.elapsed),
        remaining: snapshot.remaining,
      };
    });
    const current = get();
    saveElapsedCheckpoint(current, false);
    // The closing question is prepared in advance. Repeated ticks with the
    // same key are deduplicated by the pool; changed answers create a new key.
    if (current.remaining !== null && current.remaining > 0 && current.remaining <= 15) {
      prepareReflectQuestion(current);
    }
  },

  checkpointElapsed: () => saveElapsedCheckpoint(get(), true),

  adjustTimer: (deltaMin) => {
    set((s) => {
      if (s.remaining === null || s.endsAtMs === null || s.startedAtMs === null) return s;
      const nowMs = Date.now();
      const snapshot = sessionTimerSnapshot(s.startedAtMs, s.endsAtMs, nowMs);
      const adjusted = adjustSessionTimer(s.endsAtMs, nowMs, deltaMin * 60);
      // Move minutes by the actual remaining change, not by deltaMin:
      // at the lower bound (5 sec) the total and the progress ring would
      // otherwise drift apart
      const minutes = Math.max(
        1,
        Math.round(s.minutes + adjusted.actualDeltaSeconds / 60),
      );
      return {
        elapsed: Math.max(s.elapsed, snapshot.elapsed),
        remaining: adjusted.remaining,
        endsAtMs: adjusted.endsAtMs,
        minutes,
      };
    });
    const current = get();
    if (current.startedAtMs !== null && current.endsAtMs !== null) {
      void updatePrayerSystemTimer({
        startedAtMs: current.startedAtMs,
        endsAtMs: current.endsAtMs,
      }).catch((error) => reportSystemTimerError('update', error));
    }
  },

  prevQuestion: () =>
    set((s) => (!s.generating && s.qIndex > 0
      ? { qIndex: s.qIndex - 1, shownQuestions: rememberShownQuestion(s.shownQuestions, s.questions[s.qIndex - 1]) }
      : s)),

  nextQuestion: async () => {
    const s = get();
    if (s.generating) return;
    if (s.qIndex < s.answeredCount) {
      set({ qIndex: s.qIndex + 1,
        shownQuestions: rememberShownQuestion(s.shownQuestions, s.questions[s.qIndex + 1]) }); // forward over opened questions
      return;
    }
    const sessionToken = s.sessionId;
    const frontier = s.qIndex;
    const target = isAnswered(s.answers[frontier]) ? s.answeredCount + 1 : frontier;
    const key = poolKey(s, target);
    let q = questionPool.takeReady(key);
    if (q === undefined) {
      set({ generating: true });
      const pending = questionPool.wait(key) ?? prepareQuestion(s, target, s.answers, false);
      if (pending === null) {
        set({ generating: false });
        return;
      }
      await pending;
      const latest = get();
      if (latest.sessionId !== sessionToken || poolKey(latest, target) !== key) {
        set((st) => (st.sessionId === sessionToken ? { generating: false } : st));
        return;
      }
      q = questionPool.takeReady(key);
      if (q === undefined) {
        set({ generating: false });
        return;
      }
    }

    if (q === null) {
      set({ generating: true });
      q = await prepareQuestion(s, target, s.answers, false);
      questionPool.takeReady(key);
      if (get().sessionId !== sessionToken || poolKey(get(), target) !== key) {
        set((st) => st.sessionId === sessionToken ? { generating: false } : st);
        return;
      }
      if (!q) {
        set({ generating: false });
        return;
      }
    }

    const shown = s.shownQuestions;
    if (q.source === 'fallback' && wasQuestionShown(q.text, shown)) {
      q = localQuestion(shown, 'next');
    } else if (q.novel === false || wasQuestionShown(q.text, shown)) {
      if (!isAnswered(s.answers[frontier])) {
        // The slot is already taken: the next press will try again, with no background loop.
        set({ generating: false });
        return;
      }
      q = localQuestion(shown, 'next');
    }

    if (isAnswered(s.answers[frontier])) {
      // growth: open the next question into the trail
      const nf = s.answeredCount + 1;
      if (s.questions[nf] !== undefined) {
        set({ answeredCount: nf, qIndex: nf, generating: false,
          shownQuestions: rememberShownQuestion(shown, s.questions[nf]) });
      } else {
        questionPool.invalidate();
        const questions = s.questions.slice();
        questions[nf] = q.text;
        const questionSources = s.questionSources.slice();
        questionSources[nf] = q.source;
        set({ questions, questionSources, answeredCount: nf, qIndex: nf, generating: false,
          shownQuestions: rememberShownQuestion(shown, q.text) });
      }
    } else {
      questionPool.invalidate();
      const questions = s.questions.slice();
      questions[frontier] = q.text;
      const questionSources = s.questionSources.slice();
      questionSources[frontier] = q.source;
      set({ questions, questionSources, generating: false,
        shownQuestions: rememberShownQuestion(shown, q.text),
        skippedQuestions: [...s.skippedQuestions, s.questions[frontier]].filter(Boolean),
      });
    }

    // The question already shown does not depend on this request: the refill runs in the background.
    prepareQuestion(get(), get().qIndex);
  },

  jumpQuestion: (pos) =>
    set((s) => {
      if (s.generating) return s;
      const qIndex = Math.max(0, Math.min(pos, s.answeredCount));
      return { qIndex, shownQuestions: rememberShownQuestion(s.shownQuestions, s.questions[qIndex]) };
    }),

  saveAnswer: async (questionIndex, text, recordings) => {
    const s = get();
    if (s.sessionId !== null) {
      await db.saveAnswer(
        {
          sessionId: s.sessionId,
          questionIndex,
          question: s.questions[questionIndex],
          text,
        },
        recordings.map((r) => ({
          uri: r.uri,
          durationSec: r.durationSec,
          transcript: r.transcript,
        })),
      );
    }
    const current = get();
    // The session may have changed while the recording ran: foreign answers never go into memory.
    if (current.sessionId !== s.sessionId) return;
    const answers = { ...current.answers, [questionIndex]: { text, recordings } };
    set({ answers });
    // Any change to the AI-visible context invalidates the old slot.
    // An answered frontier prepares the next index; otherwise the current
    // question is replaced in place.
    if (current.sessionId !== null && questionIndex <= current.answeredCount) {
      const updated = get();
      const frontier = updated.answeredCount;
      const target = isAnswered(updated.answers[frontier]) ? frontier + 1 : frontier;
      prepareQuestion(updated, target);
    }
    const updatedForReflect = get();
    if (
      updatedForReflect.sessionId !== null &&
      updatedForReflect.remaining !== null &&
      updatedForReflect.remaining <= 15
    ) {
      prepareReflectQuestion(updatedForReflect);
    }
  },

  prevScripture: () => set((s) => (s.scrIndex > 0 ? { scrIndex: s.scrIndex - 1 } : s)),

  nextScripture: async () => {
    const s = get();
    if (s.scrIndex < s.scrList.length - 1) {
      set({ scrIndex: s.scrIndex + 1 });
      return;
    }
    if (s.sessionId === null || s.scrStatus === 'loading' || s.scrStatus === 'retrying') return;
    if (!s.scriptureSelection) {
      set({ scrStatus: 'loading', scrError: null });
      await loadFirstScripture(s.sessionId, scriptureToken);
      return;
    }
    await showNextScripture(s.sessionId, scriptureToken);
  },

  jumpScripture: (pos) =>
    set((s) => ({ scrIndex: Math.max(0, Math.min(pos, s.scrList.length - 1)) })),

  toggleFav: () => {
    const s = get();
    const current = s.scrList[s.scrIndex];
    if (!current) return;
    const has = s.scrFav.includes(current.canonicalId);
    set({
      scrFav: has
        ? s.scrFav.filter((id) => id !== current.canonicalId)
        : [...s.scrFav, current.canonicalId],
    });
    const write = has
      ? scriptureRepository.removeFavoriteByCanonicalId(current.canonicalId)
      : scriptureRepository.addFavoriteScripture(current, s.sessionId);
    void write.catch((error: unknown) => {
      console.error('Failed to save a favourite passage', db.errorKind(error));
      db.recordDiagnostic('favorite_save_failed', {
        operation: has ? 'remove' : 'add',
        errorKind: db.errorKind(error),
      });
      // The heart reverts to whatever the database holds, unless it was
      // toggled again in the meantime.
      set((state) => {
        if (state.scrFav.includes(current.canonicalId) === has) return state;
        return {
          scrFav: has
            ? [...state.scrFav, current.canonicalId]
            : state.scrFav.filter((id) => id !== current.canonicalId),
        };
      });
    });
  },

  retryScripture: async () => {
    const s = get();
    if (s.sessionId === null || s.scrStatus === 'loading' || s.scrStatus === 'retrying') return;
    set({ scrStatus: 'loading', scrError: null });
    await loadFirstScripture(s.sessionId, scriptureToken);
  },

  setDockMode: (dockMode) => {
    set({ dockMode });
    const state = get();
    if (dockMode === 'scripture' && state.sessionId !== null && state.scrStatus === 'idle') {
      set({ scrStatus: 'loading' });
      void loadFirstScripture(state.sessionId, scriptureToken);
    }
  },
  toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),

  finish: async () => {
    const s = get();
    // The summary screen does not tick: prayer time before it is saved immediately.
    saveElapsedCheckpoint(s, true);
    const token = ++reflectToken;
    const sessionToken = s.sessionId;
    const key = reflectKey(s);
    questionPool.invalidate();
    let q = reflectPool.takeReady(key);
    if (q === undefined) {
      set({ reflectQ: '', reflectSource: null, reflectGenerating: true });
      const pending = reflectPool.wait(key) ?? prepareReflectQuestion(s, false);
      if (pending === null) {
        set({ reflectGenerating: false });
        return;
      }
      // The closing question belongs to the state at completion time: a late
      // first question the person will never see does not cancel the wait.
      q = await pending;
      reflectPool.takeReady(key);
      if (token !== reflectToken || get().sessionId !== sessionToken) return;
    }
    if (q === null) {
      set({ reflectQ: '', reflectSource: null, reflectGenerating: true });
      q = await prepareReflectQuestion(s, false);
      reflectPool.takeReady(key);
      if (token !== reflectToken || get().sessionId !== sessionToken) return;
      if (!q) {
        set({ reflectGenerating: false });
        return;
      }
    }
    const shown = s.shownQuestions;
    if (q.novel === false || wasQuestionShown(q.text, shown)) {
      q = localQuestion(shown, 'reflect');
    }
    set({ reflectQ: q.text, reflectSource: q.source, reflectGenerating: false,
      shownQuestions: rememberShownQuestion(shown, q.text) });
  },

  complete: async (takeaway) => {
    const s = get();
    if (s.sessionId === null || s.startedAtMs === null) {
      throw new Error('No active prayer session to complete');
    }
    await stopPrayerSystemTimer().catch((error) =>
      reportSystemTimerError('stop', error),
    );
    // The prayer counts for the day it started, not the day "Done" was pressed:
    // finishSession marks the day from sessions.started_at in the same transaction.
    await db.finishSession(s.sessionId, s.elapsed, takeaway);
    const streak = await db.getStreak();
    set({ takeaway, streak });
  },

  reset: () => {
    void stopPrayerSystemTimer().catch((error) =>
      reportSystemTimerError('stop', error),
    );
    prepareToken++; // pending prepareThreshold promises no longer apply
    reflectToken++;
    scriptureToken++;
    scriptureAbortController?.abort();
    scriptureAbortController = null;
    scripturePrefetch = null;
    firstQuestionFetch = null;
    questionPool.invalidate();
    reflectPool.invalidate();
    set((s) => ({
      ...initial,
      minutes: useSettings.getState().prayerMinutes,
      streak: s.streak,
      questions: ai.getCuratedQuestions(),
      questionSources: ai.getCuratedQuestions().map(() => 'fallback'),
    }));
  },

  loadStreak: async () => {
    const streak = await db.getStreak();
    set({ streak });
  },
}));

const sessionIsCurrent = (sessionId: number, token: number) => {
  const state = useSession.getState();
  return state.sessionId === sessionId && scriptureToken === token;
};

const applyOfflineFallback = async (sessionId: number, token: number) => {
  if (!sessionIsCurrent(sessionId, token)) return;
  const selection = useSession.getState().scriptureSelection;
  if (!selection) throw new Error('Scripture selection is not confirmed');
  const cached = await scriptureRepository.getShownScriptureCache(
    selection.language,
    selection.translation,
  );
  if (!sessionIsCurrent(sessionId, token)) return;
  const current = useSession.getState();
  const offlineTrail = mergeOfflineTrail(current.scrList, cached, current.scrIndex);
  if (offlineTrail.length) {
    useSession.setState({
      scrList: offlineTrail,
      scrIndex: current.scrList.length ? current.scrIndex : 0,
      scrStatus: 'offline_fallback',
      scrError: null,
    });
  } else {
    useSession.setState({ scrStatus: 'error', scrError: 'unavailable' });
  }
};

const showScripture = async (
  sessionId: number,
  token: number,
  display: ScriptureDisplay,
) => {
  if (!sessionIsCurrent(sessionId, token)) return;
  if (display.selection.history_reset) await scriptureRepository.resetScriptureHistory();
  await scriptureRepository.recordScriptureShown(display);
  if (!sessionIsCurrent(sessionId, token)) return;
  useSession.setState((state) => ({
    scrList: [...state.scrList.slice(0, state.scrIndex + 1), display],
    scrIndex: state.scrList.length ? state.scrIndex + 1 : 0,
    scrStatus: 'ready',
    scrError: null,
  }));
  startScripturePrefetch(sessionId, token);
};

const handleScriptureFailure = async (
  sessionId: number,
  token: number,
  error: ScriptureLoadError,
) => {
  if (!sessionIsCurrent(sessionId, token)) return;
  if (error.kind === 'cancelled') return;
  await applyOfflineFallback(sessionId, token);
  if (
    sessionIsCurrent(sessionId, token) &&
    useSession.getState().scrStatus === 'error' &&
    error.kind === 'not_configured'
  ) useSession.setState({ scrError: 'not_configured' });
};

/**
 * Confirms the first Bible selection inside an already started session.
 * Substitutes nothing: without the catalog, the scripture block shows an
 * error with a retry.
 */
async function confirmScriptureSelection(sessionId: number, token: number, foreground: boolean) {
  let preferences: ScripturePreferences;
  try {
    preferences = (await ensureScripturePreferences()).preferences;
  } catch (error) {
    if (!sessionIsCurrent(sessionId, token)) return false;
    const scrError = error instanceof ScriptureCatalogUnavailableError
      ? 'catalog_unavailable'
      : error instanceof ScriptureDefaultUnavailableError
        ? 'no_default_bible'
        : 'selection_failed';
    if (scrError === 'selection_failed') db.recordDiagnostic('scripture_selection_failed', { errorKind: db.errorKind(error) });
    else console.warn('Bible selection is not confirmed', error instanceof Error ? error.message : error);
    // A hidden attempt at entry shows no error: the first opening of the block will show it.
    useSession.setState(
      foreground || useSession.getState().dockMode === 'scripture'
        ? { scrStatus: 'error', scrError }
        : { scrStatus: 'idle', scrError: null },
    );
    return false;
  }
  if (!sessionIsCurrent(sessionId, token)) return false;
  useSession.setState({ scriptureSelection: selectionFromPreferences(preferences) });
  return true;
}

/**
 * An unexpected failure (e.g., SQLite while recording show history) must not
 * leave the scripture block loading forever: the block shows an error with a
 * retry. A hidden attempt at entry, as with a Bible-selection failure, shows
 * no error: the first opening of the block retries the load.
 */
async function guardScriptureLoad(
  sessionId: number,
  token: number,
  step: 'first' | 'next',
  foreground: boolean,
  load: () => Promise<void>,
) {
  try {
    await load();
  } catch (error) {
    console.error('Failed to load Scripture', step, db.errorKind(error));
    db.recordDiagnostic('scripture_load_failed', { step, errorKind: db.errorKind(error) });
    if (!sessionIsCurrent(sessionId, token)) return;
    useSession.setState(
      foreground || useSession.getState().dockMode === 'scripture'
        ? { scrStatus: 'error', scrError: 'unavailable' }
        : { scrStatus: 'idle', scrError: null },
    );
  }
}

function loadFirstScripture(sessionId: number, token: number, foreground = true) {
  return guardScriptureLoad(sessionId, token, 'first', foreground, () =>
    runFirstScriptureLoad(sessionId, token, foreground),
  );
}

async function runFirstScriptureLoad(sessionId: number, token: number, foreground: boolean) {
  if (!sessionIsCurrent(sessionId, token)) return;
  const controller = scriptureAbortController;
  if (!controller) return;
  if (
    !useSession.getState().scriptureSelection
    && !(await confirmScriptureSelection(sessionId, token, foreground))
  ) return;
  const result = await runScriptureExclusive(() =>
    loadScriptureForState(useSession.getState(), foreground, controller.signal),
  );
  if (!sessionIsCurrent(sessionId, token)) return;
  if (!result.ok && !foreground) {
    if (useSession.getState().dockMode === 'scripture') {
      await runFirstScriptureLoad(sessionId, token, true);
    } else {
      useSession.setState({ scrStatus: 'idle', scrError: null });
    }
    return;
  }
  if (!result.ok) {
    await handleScriptureFailure(sessionId, token, result.error);
    return;
  }
  await showScripture(sessionId, token, result.display);
}

function startScripturePrefetch(sessionId: number, token: number) {
  if (!sessionIsCurrent(sessionId, token)) return;
  const state = useSession.getState();
  const controller = scriptureAbortController;
  if (!controller) return;
  if (state.scrStatus !== 'ready' || scripturePrefetch?.sessionId === sessionId) return;
  const promise = runScriptureExclusive(() =>
    loadScriptureForState(state, false, controller.signal),
  );
  const slot = { sessionId, promise };
  scripturePrefetch = slot;
  void promise.then((result) => {
    if (scripturePrefetch !== slot || !sessionIsCurrent(sessionId, token)) return;
    // Successful results stay in the one-ahead slot until the user asks for them.
    // Failed background requests are discarded silently; an explicit Next retries.
    if (!result.ok) scripturePrefetch = null;
  }, (error: unknown) => {
    // An explicit "Next" waiting on this promise will show the error itself; here only a trace is left.
    console.error('Failed to prefetch Scripture', db.errorKind(error));
    db.recordDiagnostic('scripture_load_failed', { step: 'prefetch', errorKind: db.errorKind(error) });
    if (scripturePrefetch === slot) scripturePrefetch = null;
  });
}

function showNextScripture(sessionId: number, token: number) {
  return guardScriptureLoad(sessionId, token, 'next', true, () =>
    runNextScriptureLoad(sessionId, token),
  );
}

async function runNextScriptureLoad(sessionId: number, token: number) {
  if (!sessionIsCurrent(sessionId, token)) return;
  const controller = scriptureAbortController;
  if (!controller) return;
  const startedAtIndex = useSession.getState().scrIndex;
  const prefetched = scripturePrefetch?.sessionId === sessionId ? scripturePrefetch : null;
  useSession.setState({ scrStatus: prefetched ? 'loading' : 'retrying', scrError: null });
  let result = prefetched
    ? await prefetched.promise
    : await runScriptureExclusive(() =>
        loadScriptureForState(useSession.getState(), true, controller.signal)
      );
  if (scripturePrefetch === prefetched) scripturePrefetch = null;
  if (!sessionIsCurrent(sessionId, token)) return;

  if (!result.ok && prefetched) {
    useSession.setState({ scrStatus: 'retrying' });
    result = await runScriptureExclusive(() =>
      loadScriptureForState(useSession.getState(), true, controller.signal)
    );
  }
  if (!sessionIsCurrent(sessionId, token)) return;
  if (!result.ok) {
    await handleScriptureFailure(sessionId, token, result.error);
    return;
  }
  if (shouldDeferLoadedNext(startedAtIndex, useSession.getState().scrIndex)) {
    scripturePrefetch = { sessionId, promise: Promise.resolve(result) };
    useSession.setState({ scrStatus: 'ready', scrError: null });
    return;
  }
  await showScripture(sessionId, token, result.display);
}

/**
 * Full session reset including the streak. The plain `reset()` keeps the
 * streak: it mirrors database history and must not be lost when leaving a
 * prayer. After a data wipe the history is gone, so it is zeroed too.
 */
export const resetSessionStore = () => {
  useSession.getState().reset();
  useSession.setState({ streak: { count: 0, prayedToday: false, week: Array(7).fill(false) } });
};

export const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};
