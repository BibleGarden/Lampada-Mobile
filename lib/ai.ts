// Questions and reflection use server-side prompts and model settings.
// A failed background prefetch yields no content; an explicit request keeps the usual error handling.

import { PrefetchDeniedError } from './prefetch.ts';
import { completePrayerContent, llmConfigured } from './llm';
import { coreAiAllowedNow, useSettings } from './settings';
import { fallbackQuestions } from './locales/fallbackQuestions';
import { buildQuestionRequest } from './questionRequest';
import { normalizeQuestion, wasQuestionShown } from './questionNovelty';
import { recordDiagnostic } from './db';
import type { AnswerContext } from './answerContext';

export type QuestionSource = 'ai' | 'fallback';
export type GeneratedQuestion = { text: string; source: QuestionSource; novel?: boolean };

const fromAi = (text: string): GeneratedQuestion => ({ text, source: 'ai' });
const fromFallback = (text: string): GeneratedQuestion => ({ text, source: 'fallback' });

const currentFallbacks = () => fallbackQuestions[useSettings.getState().uiLanguage];
export const getCuratedQuestions = (): string[] => [...currentFallbacks().first];
export const hasUnseenFallbackQuestion = (shown: readonly string[], stage: 'next' | 'reflect'): boolean =>
  currentFallbacks()[stage].some((question) => !wasQuestionShown(question, shown));

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

/** An instant local question for when the background slot is not ready yet. */
export const pickFallbackQuestion = (asked: string[], stage: 'next' | 'reflect' = 'next'): string => {
  const questionPool = currentFallbacks()[stage];
  const fresh = questionPool.filter((q) => !wasQuestionShown(q, asked));
  if (fresh.length) return pickRandom(fresh);
  // Every option has already been shown: pick the one seen earliest.
  const lastShown = new Map(asked.map((question, index) => [normalizeQuestion(question), index]));
  return questionPool.reduce((oldest, candidate) =>
    (lastShown.get(normalizeQuestion(candidate)) ?? -1)
      < (lastShown.get(normalizeQuestion(oldest)) ?? -1) ? candidate : oldest,
  );
};

// Degradation is silent for the user but not for the developer: the reason
// for falling back to the curated pool shows up in dev-server logs
const warn = (where: string, e: unknown, prefetch = false) =>
  console.warn(`[ai] ${where}: ${prefetch ? 'prefetch unavailable' : 'using fallback pool'} —`, e instanceof Error ? e.message : e);

const invalidQuestion = (where: string, prefetch: boolean) => {
  recordDiagnostic('ai_question_invalid', { stage: where, prefetch: Number(prefetch) });
  warn(where, 'Invalid question response', prefetch);
};

// Whitespace is normalized, but model garbage is not hidden by deleting characters.
const tidy = (q: string) => q.replace(/\s+/g, ' ').trim();

const isQuestion = (q: unknown): q is string =>
  typeof q === 'string' && q.length >= 8 && q.length <= 180
  && /^[\p{L}\p{N}«“„"'‘\-—–]/u.test(q)
  && !/[{}\[\]<>`#*]/u.test(q)
  && !/^"?(question|text|json|вопрос|питання)"?\s*:/iu.test(q)
  && !/^(\d+[.)]|[-•])\s/u.test(q)
  && q.includes('?');

/**
 * The first prayer question — prepared in advance, at the "threshold".
 * The remaining questions are not prepared as a batch: a single-item buffer
 * is replenished during the prayer and rebuilt after each new answer.
 */
export async function generateFirstQuestion(topic: string, prefetch = false): Promise<GeneratedQuestion | null> {
  const fallback = () => prefetch ? null : fromFallback(pickRandom(currentFallbacks().first));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent({
      ...buildQuestionRequest('first', topic, [], {}, [], {}),
      ...(prefetch ? { prefetch: true } : {}),
    });
    const clean = tidy(q.text);
    if (!isQuestion(clean)) invalidQuestion('firstQuestion', prefetch);
    return isQuestion(clean) && q.novel !== false ? fromAi(clean) : fallback();
  } catch (e) {
    if (prefetch && e instanceof PrefetchDeniedError) return null;
    warn('firstQuestion', e, prefetch);
    return fallback();
  }
}

/**
 * One new question that does not repeat the ones already asked.
 * `answers` are passed only under a separate answer-context consent —
 * otherwise the caller must pass {}, and the transport re-checks the gate.
 * The answer index preserves the link to the corresponding question.
 */
export async function generateQuestion(
  topic: string,
  asked: string[],
  answers: Record<number, AnswerContext>,
  skippedQuestions: string[],
  prefetch: boolean,
  actualAnswers: Record<number, AnswerContext>,
): Promise<GeneratedQuestion | null> {
  if (actualAnswers === undefined) throw new Error('Actual question answers are required');
  const fallback = () => prefetch ? null : fromFallback(pickFallbackQuestion([...asked, ...skippedQuestions]));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent({
      ...buildQuestionRequest('next', topic, asked, answers, skippedQuestions, actualAnswers),
      ...(prefetch ? { prefetch: true } : {}),
    });
    const clean = tidy(q.text);
    if (!isQuestion(clean)) invalidQuestion('question', prefetch);
    return isQuestion(clean) ? { ...fromAi(clean), novel: q.novel } : fallback();
  } catch (e) {
    if (prefetch && e instanceof PrefetchDeniedError) return null;
    warn('question', e, prefetch);
    return fallback();
  }
}

/** A reflection question based on the topic and the session's answers */
export async function generateReflectQuestion(
  topic: string,
  asked: string[],
  answers: Record<number, AnswerContext>,
  skippedQuestions: string[],
  prefetch: boolean,
  actualAnswers: Record<number, AnswerContext>,
): Promise<GeneratedQuestion | null> {
  if (actualAnswers === undefined) throw new Error('Actual question answers are required');
  const fallback = () => prefetch ? null : fromFallback(pickFallbackQuestion([...asked, ...skippedQuestions], 'reflect'));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent({
      ...buildQuestionRequest('reflect', topic, asked, answers, skippedQuestions, actualAnswers),
      ...(prefetch ? { prefetch: true } : {}),
    });
    const clean = tidy(q.text);
    if (!isQuestion(clean)) invalidQuestion('reflect', prefetch);
    return isQuestion(clean) && q.novel !== false && !wasQuestionShown(clean, [...asked, ...skippedQuestions])
      ? fromAi(clean) : fallback();
  } catch (e) {
    if (prefetch && e instanceof PrefetchDeniedError) return null;
    warn('reflect', e, prefetch);
    return fallback();
  }
}
