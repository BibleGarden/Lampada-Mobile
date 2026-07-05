import { create } from 'zustand';
import * as ai from './ai';
import { scriptures } from './scriptures';
import * as db from './db';
import { shareAnswersNow } from './settings';

// Логика сессии, перенесённая из прототипа.
//
// Вопросы: линейный «след» открытых вопросов + «фронтир» (текущий неотвеченный).
// ◀ ▶ ходят только по открытым (0..answeredCount). На фронтире правая кнопка:
//  - вопрос отвечен → открыть следующий (из пула или сгенерировать);
//  - не отвечен → заменить вопрос на месте (перегенерация).
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
  qIndex: number;
  answeredCount: number;
  answers: Record<number, Answer>;
  generating: boolean;

  scrList: number[]; // индексы каталога в следе
  scrIndex: number; // позиция в scrList
  scrFav: number[]; // каталожные индексы в избранном

  dockMode: 'question' | 'scripture';
  musicOn: boolean;

  remaining: number | null; // сек; null = без таймера
  elapsed: number;

  // reflect
  reflectQ: string;
  takeaway: string;

  streak: db.Streak;
};

type SessionActions = {
  setTopic: (t: string) => void;
  setMinutes: (m: number) => void;
  incMinutes: () => void;
  decMinutes: () => void;

  prepareThreshold: () => void;
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

const initial: SessionState = {
  topic: '',
  minutes: 10,
  sessionId: null,
  questions: ai.curatedQuestions,
  qIndex: 0,
  answeredCount: 0,
  answers: {},
  generating: false,
  scrList: [0],
  scrIndex: 0,
  scrFav: [],
  dockMode: 'question',
  musicOn: false,
  remaining: 600,
  elapsed: 0,
  reflectQ: '',
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
    // вопросы подгружаются заранее, пока человек на «пороге»
    ai.generateQuestions(topic).then((qs) => {
      if (token === prepareToken) set({ questions: qs });
    });
  },

  enterSession: async () => {
    const { topic, minutes } = get();
    const sessionId = await db.createSession(topic, minutes);
    set({
      sessionId,
      qIndex: 0,
      answeredCount: 0,
      answers: {},
      scrList: [0],
      scrIndex: 0,
      scrFav: [],
      dockMode: 'question',
      musicOn: false,
      remaining: minutes === 0 ? null : minutes * 60,
      elapsed: 0,
    });
  },

  tick: () =>
    set((s) => {
      const elapsed = s.elapsed + 1;
      if (s.remaining === null) return { elapsed };
      return { elapsed, remaining: Math.max(0, s.remaining - 1) };
    }),

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

  // навигация по вопросам заморожена, пока идёт генерация: иначе результат
  // await-а ляжет на чужой индекс
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
    // индекс фиксируется до await — навигация заблокирована generating,
    // но токен сессии дополнительно отсекает результат после reset()
    const frontier = s.qIndex;
    if (isAnswered(s.answers[frontier])) {
      // плюс: открыть следующий вопрос в след
      const nf = s.answeredCount + 1;
      if (s.questions[nf] !== undefined) {
        set({ answeredCount: nf, qIndex: nf });
      } else {
        set({ generating: true });
        const q = await ai.generateQuestion(s.topic, s.questions, answersForAi(s.answers));
        set((st) => {
          if (st.sessionId !== sessionToken) return st; // сессия уже другая
          const questions = st.questions.slice();
          questions[nf] = q;
          return { questions, answeredCount: nf, qIndex: nf, generating: false };
        });
      }
    } else {
      // перегенерация: заменить текущий на месте
      set({ generating: true });
      const q = await ai.generateQuestion(s.topic, s.questions, answersForAi(s.answers));
      set((st) => {
        if (st.sessionId !== sessionToken) return st;
        const questions = st.questions.slice();
        questions[frontier] = q;
        return { questions, generating: false };
      });
    }
  },

  jumpQuestion: (pos) =>
    set((s) =>
      s.generating ? s : { qIndex: Math.max(0, Math.min(pos, s.answeredCount)) },
    ),

  saveAnswer: (questionIndex, text, recordings) => {
    const s = get();
    set({
      answers: { ...s.answers, [questionIndex]: { text, recordings } },
    });
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
        scrList.push(pickScripture(scrList));
        return { scrList, scrIndex: s.scrIndex + 1 };
      }
      scrList[s.scrIndex] = pickScripture(scrList);
      return { scrList };
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
    set({ reflectQ: '' });
    ai.generateReflectQuestion(s.topic, answersForAi(s.answers)).then((q) =>
      set({ reflectQ: q }),
    );
  },

  complete: async (takeaway) => {
    const s = get();
    if (s.sessionId !== null) await db.finishSession(s.sessionId, s.elapsed, takeaway);
    const streak = await db.markPrayedToday();
    set({ takeaway, streak });
  },

  reset: () => {
    prepareToken++; // висящие prepareThreshold-промисы больше не применятся
    set((s) => ({
      ...initial,
      streak: s.streak,
      questions: ai.curatedQuestions,
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
