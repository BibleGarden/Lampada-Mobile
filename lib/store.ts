import { create } from 'zustand';
import * as ai from './ai';
import * as db from './db';
import {
  ensureSettingsLoaded,
  scripturePreferencesNow,
  shareAnswersNow,
} from './settings';
import type { ScriptureLanguage } from './scripture';
import { createOneAheadPool } from './oneAheadPool';
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
import {
  startPrayerSystemTimer,
  stopPrayerSystemTimer,
  updatePrayerSystemTimer,
} from './prayerSystemTimer';

// Логика сессии, перенесённая из прототипа.
//
// Вопросы: линейный «след» открытых вопросов + «фронтир» (текущий неотвеченный).
// ◀ ▶ ходят только по открытым (0..answeredCount). На фронтире правая кнопка:
//  - вопрос отвечен → открыть следующий из пула;
//  - не отвечен → заменить вопрос на месте из того же пула.
// Ready-слот показывается сразу, pending-слот дожидается своего запроса.
//
// Писание: та же механика, но «след» растёт сердечком (избранное), не ответом.

export type RecordingDraft = {
  id: number;
  uri: string;
  durationSec: number;
  transcript: string | null;
  transcriptState?: 'idle' | 'loading' | 'error';
};

export type Answer = { text: string; recordings: RecordingDraft[] };

type SessionState = {
  // setup
  topic: string;
  minutes: number; // 0 = без таймера

  // session runtime
  sessionId: number | null;
  questions: string[];
  questionSources: ai.QuestionSource[];
  qIndex: number;
  answeredCount: number;
  answers: Record<number, Answer>;
  generating: boolean;

  scrList: ScriptureDisplay[]; // фактически показанный след текущей сессии
  scrIndex: number; // позиция в scrList
  scrFav: string[]; // canonical ID серверных записей в избранном
  scriptureLanguage: ScriptureLanguage; // snapshot выбора на входе в сессию
  scriptureTranslation: number;
  scriptureVoice: number;
  scrStatus: 'idle' | 'loading' | 'ready' | 'retrying' | 'error' | 'offline_fallback';
  scrError: 'not_configured' | 'unavailable' | null;

  dockMode: 'question' | 'scripture';
  musicOn: boolean;

  remaining: number | null; // сек; null = без таймера
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
  tick: (nowMs?: number) => void;
  adjustTimer: (deltaMin: number) => void;

  prevQuestion: () => void;
  nextQuestion: () => Promise<void>;
  jumpQuestion: (pos: number) => void;
  saveAnswer: (questionIndex: number, text: string, recordings: RecordingDraft[]) => void;

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

const reportSystemTimerError = (action: string, error: unknown) => {
  console.warn(
    `Не удалось ${action} системный таймер молитвы`,
    error instanceof Error ? error.message : error,
  );
};

// тексты ответов для промпта — только с разрешения из настроек
// («Использовать ответы для цитат и вопросов»); без него ответы не покидают устройство
const answersForAi = (answers: Record<number, Answer>) =>
  shareAnswersNow()
    ? Object.values(answers)
        .map((a) => a.text.trim())
        .filter(Boolean)
    : [];

let prepareToken = 0;
let reflectToken = 0;
let scriptureToken = 0;
let scriptureAbortController: AbortController | null = null;
let firstQuestionFetch: {
  topic: string;
  promise: Promise<ai.GeneratedQuestion>;
  result?: ai.GeneratedQuestion;
} | null = null;

// Готовый слот показывается синхронно. Если слот ещё pending, кнопка ждёт
// именно уже запущенный запрос; новый refill стартует только после показа.
const questionPool = createOneAheadPool<ai.GeneratedQuestion>();
const reflectPool = createOneAheadPool<ai.GeneratedQuestion>();

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

const poolKey = (
  s: SessionState,
  index: number,
  answers: Record<number, Answer> = s.answers,
) => JSON.stringify([s.sessionId, index, s.topic, s.questions, answersForAi(answers)]);

const prepareQuestion = (
  s: SessionState,
  index: number,
  answers: Record<number, Answer> = s.answers,
) => {
  if (s.sessionId === null) return null;
  const key = poolKey(s, index, answers);
  return questionPool.prepare(key, () =>
    ai.generateQuestion(s.topic, s.questions, answersForAi(answers)),
  );
};

const reflectKey = (s: SessionState) =>
  JSON.stringify([s.sessionId, s.topic, answersForAi(s.answers)]);

const prepareReflectQuestion = (s: SessionState) => {
  if (s.sessionId === null) return null;
  const key = reflectKey(s);
  return reflectPool.prepare(key, () =>
    ai.generateReflectQuestion(s.topic, answersForAi(s.answers)),
  );
};

const writtenReplies = (answers: Record<number, Answer>) =>
  Object.values(answers)
    .map((answer) => answer.text.trim())
    .filter(Boolean);

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
  const shownCanonicalIds = await scriptureRepository.getScriptureHistory();
  const request = buildScriptureRequest({
    language: s.scriptureLanguage,
    translation: s.scriptureTranslation,
    topic: s.topic,
    replies: writtenReplies(s.answers),
    shareReplies: shareAnswersNow(),
    shownCanonicalIds,
  });
  const result = foreground
    ? await selectScripture(request, { signal })
    : await selectScriptureOnce(request, { signal });
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
  minutes: 10,
  sessionId: null,
  questions: ai.curatedQuestions,
  questionSources: ai.curatedQuestions.map(() => 'fallback'),
  qIndex: 0,
  answeredCount: 0,
  answers: {},
  generating: false,
  scrList: [],
  scrIndex: 0,
  scrFav: [],
  scriptureLanguage: 'ru',
  scriptureTranslation: 1,
  scriptureVoice: 1,
  scrStatus: 'idle',
  scrError: null,
  dockMode: 'question',
  musicOn: false,
  remaining: 600,
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
      return { minutes: Math.min(s.minutes + step, 120) };
    }),
  decMinutes: () =>
    set((s) => {
      if (s.minutes === 0) return s;
      const step = s.minutes <= 5 ? 1 : 5;
      return { minutes: Math.max(s.minutes - step, 1) };
    }),

  prepareThreshold: () => {
    const { topic } = get();
    // токен отсекает результаты устаревших промисов: повторный заход
    // на порог с другой темой или reset() делают старый ответ неактуальным
    const token = ++prepareToken;
    // заранее готовится только первый вопрос: остальные генерируются
    // по ходу молитвы, с учётом живых ответов (если человек разрешил).
    // Результат применяется только до входа в сессию: опоздавший вопрос
    // не должен затирать уже идущую молитву
    const promise = ai.generateFirstQuestion(topic);
    const fetch: NonNullable<typeof firstQuestionFetch> = { topic, promise };
    firstQuestionFetch = fetch;
    promise.then((q) => {
      if (firstQuestionFetch === fetch) fetch.result = q;
      if (token === prepareToken) {
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
    // Вход не зависит от сети. Пока первый вопрос готовится, карточка вопроса
    // показывает spinner; fallback появляется только когда AI-слой вернул его
    // из-за явной ошибки.
    const fetch: NonNullable<typeof firstQuestionFetch> =
      firstQuestionFetch?.topic === topic
        ? firstQuestionFetch
        : { topic, promise: ai.generateFirstQuestion(topic) };
    firstQuestionFetch = fetch;
    const firstQuestion = fetch.result;
    const [sessionId, favoriteScriptures] = await Promise.all([
      db.createSession(topic, minutes),
      ensureSettingsLoaded().then(() => scriptureRepository.getFavoriteScriptures()),
    ]);
    const scripturePreferences = scripturePreferencesNow();
    const startedAtMs = Date.now();
    // висящая генерация первого вопроса с порога больше не применится
    prepareToken++;
    firstQuestionFetch = null;
    questionPool.invalidate();
    reflectPool.invalidate();
    set({
      sessionId,
      questions: [firstQuestion?.text ?? ''],
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
      scriptureLanguage: scripturePreferences.language,
      scriptureTranslation: scripturePreferences.translationCode,
      scriptureVoice: scripturePreferences.voiceCode,
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
    ).catch((error) => reportSystemTimerError('запустить', error));
    scriptureAbortController?.abort();
    scriptureAbortController = new AbortController();
    const currentScriptureToken = ++scriptureToken;
    scripturePrefetch = null;
    void loadFirstScripture(sessionId, currentScriptureToken);
    if (firstQuestion) {
      // Первый запасной вопрос начинает готовиться сразу после входа.
      prepareQuestion(get(), 0);
      return;
    }

    void fetch.promise.then((question) => {
      if (get().sessionId !== sessionId) return;
      set({
        questions: [question.text],
        questionSources: [question.source],
        generating: false,
      });
      prepareQuestion(get(), 0);
    });
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
    // Итоговый вопрос готовится заранее. Повторные тики с тем же ключом
    // дедуплицируются пулом, а изменение ответов создаёт новый ключ.
    if (current.remaining !== null && current.remaining > 0 && current.remaining <= 15) {
      prepareReflectQuestion(current);
    }
  },

  adjustTimer: (deltaMin) => {
    set((s) => {
      if (s.remaining === null || s.endsAtMs === null || s.startedAtMs === null) return s;
      const nowMs = Date.now();
      const snapshot = sessionTimerSnapshot(s.startedAtMs, s.endsAtMs, nowMs);
      const adjusted = adjustSessionTimer(s.endsAtMs, nowMs, deltaMin * 60);
      // minutes двигаем на фактическое изменение remaining, а не на deltaMin:
      // у нижней границы (5 сек) иначе разъезжаются total и кольцо прогресса
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
      }).catch((error) => reportSystemTimerError('обновить', error));
    }
  },

  prevQuestion: () =>
    set((s) => (!s.generating && s.qIndex > 0 ? { qIndex: s.qIndex - 1 } : s)),

  nextQuestion: async () => {
    const s = get();
    if (s.generating) return;
    if (s.qIndex < s.answeredCount) {
      set({ qIndex: s.qIndex + 1 }); // вперёд по открытым
      return;
    }
    const sessionToken = s.sessionId;
    const frontier = s.qIndex;
    const target = isAnswered(s.answers[frontier]) ? s.answeredCount + 1 : frontier;
    const key = poolKey(s, target);
    let q = questionPool.takeReady(key);
    if (q === undefined) {
      set({ generating: true });
      const pending = questionPool.wait(key) ?? prepareQuestion(s, target);
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

    if (isAnswered(s.answers[frontier])) {
      // плюс: открыть следующий вопрос в след
      const nf = s.answeredCount + 1;
      if (s.questions[nf] !== undefined) {
        set({ answeredCount: nf, qIndex: nf, generating: false });
      } else {
        questionPool.invalidate();
        const questions = s.questions.slice();
        questions[nf] = q.text;
        const questionSources = s.questionSources.slice();
        questionSources[nf] = q.source;
        set({ questions, questionSources, answeredCount: nf, qIndex: nf, generating: false });
      }
    } else {
      questionPool.invalidate();
      const questions = s.questions.slice();
      questions[frontier] = q.text;
      const questionSources = s.questionSources.slice();
      questionSources[frontier] = q.source;
      set({ questions, questionSources, generating: false });
    }

    // Уже показанный вопрос не зависит от этого запроса: refill идёт в фоне.
    prepareQuestion(get(), get().qIndex);
  },

  jumpQuestion: (pos) =>
    set((s) =>
      s.generating ? s : { qIndex: Math.max(0, Math.min(pos, s.answeredCount)) },
    ),

  saveAnswer: (questionIndex, text, recordings) => {
    const s = get();
    const answers = { ...s.answers, [questionIndex]: { text, recordings } };
    set({ answers });
    // Любое изменение доступного AI-контекста инвалидирует старый слот.
    // Для отвеченного фронтира готовится следующий индекс, иначе — замена
    // текущего вопроса на месте.
    if (s.sessionId !== null && questionIndex <= s.answeredCount) {
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
    if (s.sessionId !== null) {
      db.saveAnswer({
        sessionId: s.sessionId,
        questionIndex,
        question: s.questions[questionIndex],
        text,
      });
      // полная перезапись: повторное сохранение не плодит дублей,
      // удалённые в шторке записи уходят и из БД
      db.replaceRecordings(
        s.sessionId,
        questionIndex,
        recordings.map((r) => ({
          uri: r.uri,
          durationSec: r.durationSec,
          transcript: r.transcript,
        })),
      );
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
    if (has) {
      void scriptureRepository.removeFavoriteByCanonicalId(current.canonicalId);
    } else {
      void scriptureRepository.addFavoriteScripture(current);
    }
  },

  retryScripture: async () => {
    const s = get();
    if (s.sessionId === null || s.scrStatus === 'loading' || s.scrStatus === 'retrying') return;
    set({ scrStatus: 'loading', scrError: null });
    await loadFirstScripture(s.sessionId, scriptureToken);
  },

  setDockMode: (dockMode) => set({ dockMode }),
  toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),

  finish: async () => {
    const s = get();
    const token = ++reflectToken;
    const sessionToken = s.sessionId;
    const key = reflectKey(s);
    questionPool.invalidate();
    let q = reflectPool.takeReady(key);
    if (q === undefined) {
      set({ reflectQ: '', reflectSource: null, reflectGenerating: true });
      const pending = reflectPool.wait(key) ?? prepareReflectQuestion(s);
      if (pending === null) {
        set({ reflectGenerating: false });
        return;
      }
      await pending;
      if (
        token !== reflectToken ||
        get().sessionId !== sessionToken ||
        reflectKey(get()) !== key
      ) {
        return;
      }
      q = reflectPool.takeReady(key);
      if (q === undefined) {
        set({ reflectGenerating: false });
        return;
      }
    }
    if (token === reflectToken && get().sessionId === sessionToken) {
      set({ reflectQ: q.text, reflectSource: q.source, reflectGenerating: false });
    }
  },

  complete: async (takeaway) => {
    const s = get();
    await stopPrayerSystemTimer().catch((error) =>
      reportSystemTimerError('остановить', error),
    );
    if (s.sessionId !== null) await db.finishSession(s.sessionId, s.elapsed, takeaway);
    const streak = await db.markPrayedToday();
    set({ takeaway, streak });
  },

  reset: () => {
    void stopPrayerSystemTimer().catch((error) =>
      reportSystemTimerError('остановить', error),
    );
    prepareToken++; // висящие prepareThreshold-промисы больше не применятся
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
      streak: s.streak,
      questions: ai.curatedQuestions,
      questionSources: ai.curatedQuestions.map(() => 'fallback'),
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
  const state = useSession.getState();
  const cached = await scriptureRepository.getShownScriptureCache(
    state.scriptureLanguage,
    state.scriptureTranslation,
  );
  if (!sessionIsCurrent(sessionId, token)) return;
  const current = useSession.getState();
  if (current.scrList.length) {
    useSession.setState({
      scrList: mergeOfflineTrail(current.scrList, cached, current.scrIndex),
      scrStatus: 'offline_fallback',
      scrError: null,
    });
  } else if (cached.length) {
    useSession.setState({
      scrList: cached,
      scrIndex: 0,
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

async function loadFirstScripture(sessionId: number, token: number) {
  if (!sessionIsCurrent(sessionId, token)) return;
  const controller = scriptureAbortController;
  if (!controller) return;
  const result = await runScriptureExclusive(() =>
    loadScriptureForState(useSession.getState(), true, controller.signal),
  );
  if (!sessionIsCurrent(sessionId, token)) return;
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
  });
}

async function showNextScripture(sessionId: number, token: number) {
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
 * Полный сброс сессии вместе со streak. Обычный `reset()` сохраняет streak: он
 * отражает историю в базе и не должен теряться при выходе из молитвы. После
 * стирания данных истории больше нет, поэтому обнуляется и он.
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

export const plMinutes = (n: number) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'минут';
  if (b === 1) return 'минута';
  if (b >= 2 && b <= 4) return 'минуты';
  return 'минут';
};
