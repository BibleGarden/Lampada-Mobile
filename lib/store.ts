import { create } from 'zustand';
import * as ai from './ai';
import { scriptures } from './scriptures';
import * as db from './db';
import { shareAnswersNow } from './settings';
import { createOneAheadPool } from './oneAheadPool';
import { favoriteIndexesFromRefs } from './favorites';

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

  scrList: number[]; // индексы каталога в следе
  scrIndex: number; // позиция в scrList
  scrFav: number[]; // каталожные индексы в избранном
  scrNext: number; // готовый запасной индекс для ротации

  dockMode: 'question' | 'scripture';
  musicOn: boolean;

  remaining: number | null; // сек; null = без таймера
  elapsed: number;

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
  tick: () => void;
  adjustTimer: (deltaMin: number) => void;

  prevQuestion: () => void;
  nextQuestion: () => Promise<void>;
  jumpQuestion: (pos: number) => void;
  saveAnswer: (questionIndex: number, text: string, recordings: RecordingDraft[]) => void;

  prevScripture: () => void;
  nextScripture: () => void;
  jumpScripture: (pos: number) => void;
  toggleFav: () => void;

  setDockMode: (m: 'question' | 'scripture') => void;
  toggleMusic: () => void;

  finish: () => Promise<void>;
  complete: (takeaway: string) => Promise<void>;
  reset: () => void;
  loadStreak: () => Promise<void>;
};

const isAnswered = (a: Answer | undefined) =>
  !!(a && (a.text.trim() || a.recordings.length));

// тексты ответов для промпта — только с разрешения из настроек
// («Учитывать мои ответы»); без него ответы не покидают устройство
const answersForAi = (answers: Record<number, Answer>) =>
  shareAnswersNow()
    ? Object.values(answers)
        .map((a) => a.text.trim())
        .filter(Boolean)
    : [];

const pickScripture = (used: number[]): number => {
  const set = new Set(used);
  for (let i = 0; i < scriptures.length; i++) if (!set.has(i)) return i;
  return (used[used.length - 1] + 1) % scriptures.length; // каталог исчерпан — по кругу
};

let prepareToken = 0;
let reflectToken = 0;
let firstQuestionFetch: {
  topic: string;
  promise: Promise<ai.GeneratedQuestion>;
  result?: ai.GeneratedQuestion;
} | null = null;

// Готовый слот показывается синхронно. Если слот ещё pending, кнопка ждёт
// именно уже запущенный запрос; новый refill стартует только после показа.
const questionPool = createOneAheadPool<ai.GeneratedQuestion>();
const reflectPool = createOneAheadPool<ai.GeneratedQuestion>();

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
  scrList: [0],
  scrIndex: 0,
  scrFav: [],
  scrNext: pickScripture([0]),
  dockMode: 'question',
  musicOn: false,
  remaining: 600,
  elapsed: 0,
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
    const [sessionId, favoriteRefs] = await Promise.all([
      db.createSession(topic, minutes),
      db.getFavorites(),
    ]);
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
      scrList: [0],
      scrIndex: 0,
      scrFav: favoriteIndexesFromRefs(favoriteRefs, scriptures),
      scrNext: pickScripture([0]),
      dockMode: 'question',
      musicOn: false,
      remaining: minutes === 0 ? null : minutes * 60,
      elapsed: 0,
      reflectQ: '',
      reflectSource: null,
      reflectGenerating: false,
    });
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

  tick: () => {
    set((s) => {
      const elapsed = s.elapsed + 1;
      if (s.remaining === null) return { elapsed };
      return { elapsed, remaining: Math.max(0, s.remaining - 1) };
    });
    const current = get();
    // Итоговый вопрос готовится заранее. Повторные тики с тем же ключом
    // дедуплицируются пулом, а изменение ответов создаёт новый ключ.
    if (current.remaining !== null && current.remaining > 0 && current.remaining <= 15) {
      prepareReflectQuestion(current);
    }
  },

  adjustTimer: (deltaMin) =>
    set((s) => {
      if (s.remaining === null) return s;
      const remaining = Math.max(s.remaining + deltaMin * 60, 5);
      // minutes двигаем на фактическое изменение remaining, а не на deltaMin:
      // у нижней границы (5 сек) иначе разъезжаются total и кольцо прогресса
      const actualDeltaSec = remaining - s.remaining;
      const minutes = Math.max(1, Math.round(s.minutes + actualDeltaSec / 60));
      return { remaining, minutes };
    }),

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
        recordings.map((r) => ({ uri: r.uri, durationSec: r.durationSec })),
      );
    }
  },

  prevScripture: () => set((s) => (s.scrIndex > 0 ? { scrIndex: s.scrIndex - 1 } : s)),

  nextScripture: () =>
    set((s) => {
      if (s.scrIndex < s.scrList.length - 1) return { scrIndex: s.scrIndex + 1 };
      const fav = s.scrFav.includes(s.scrList[s.scrIndex]);
      const scrList = s.scrList.slice();
      if (fav) {
        scrList.push(s.scrNext);
        return {
          scrList,
          scrIndex: s.scrIndex + 1,
          scrNext: pickScripture(scrList),
        };
      }
      scrList[s.scrIndex] = s.scrNext;
      return { scrList, scrNext: pickScripture(scrList) };
    }),

  jumpScripture: (pos) => set({ scrIndex: pos }),

  toggleFav: () => {
    const s = get();
    const cat = s.scrList[s.scrIndex];
    const has = s.scrFav.includes(cat);
    set({ scrFav: has ? s.scrFav.filter((x) => x !== cat) : [...s.scrFav, cat] });
    db.toggleFavorite(scriptures[cat].ref);
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
    if (s.sessionId !== null) await db.finishSession(s.sessionId, s.elapsed, takeaway);
    const streak = await db.markPrayedToday();
    set({ takeaway, streak });
  },

  reset: () => {
    prepareToken++; // висящие prepareThreshold-промисы больше не применятся
    reflectToken++;
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
