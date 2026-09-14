// Вопросы и рефлексия используют серверные промпты и настройки модели.
// Неудачная фоновая подготовка не даёт контента; явный запрос сохраняет прежнюю обработку ошибок.

import { PrefetchDeniedError } from './prefetch.ts';
import { completePrayerContent, llmConfigured } from './llm';
import { coreAiAllowedNow, useSettings } from './settings';
import { fallbackQuestions } from './locales/fallbackQuestions';
import { buildQuestionRequest } from './questionRequest';
import type { AnswerContext } from './answerContext';

export type QuestionSource = 'ai' | 'fallback';
export type GeneratedQuestion = { text: string; source: QuestionSource; novel?: boolean };

const fromAi = (text: string): GeneratedQuestion => ({ text, source: 'ai' });
const fromFallback = (text: string): GeneratedQuestion => ({ text, source: 'fallback' });

const currentFallbacks = () => fallbackQuestions[useSettings.getState().uiLanguage];
export const getCuratedQuestions = (): string[] => [...currentFallbacks().first];

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

/** Мгновенный локальный вопрос на случай, если фоновый слот ещё не готов. */
export const pickFallbackQuestion = (asked: string[]): string => {
  const questionPool = currentFallbacks().next;
  const used = new Set(asked);
  const fresh = questionPool.filter((q) => !used.has(q));
  return pickRandom(fresh.length ? fresh : questionPool);
};

// деградация тихая для человека, но не для разработчика: причина отката
// на курируемый пул видна в логах dev-сервера
const warn = (where: string, e: unknown, prefetch = false) =>
  console.warn(`[ai] ${where}: ${prefetch ? 'prefetch unavailable' : 'using fallback pool'} —`, e instanceof Error ? e.message : e);

// один вопрос — одна строка: нумерация и маркеры из модели вычищаются
const tidy = (q: string) =>
  q.replace(/^[\s\d.\-—)*]+/, '').replace(/\s+/g, ' ').trim();

const isQuestion = (q: unknown): q is string =>
  typeof q === 'string' && q.trim().length >= 8 && q.trim().length <= 180 && q.includes('?');

/**
 * Первый вопрос молитвы — готовится заранее, на «пороге».
 * Остальные вопросы не заготавливаются пакетом: одноэлементный буфер
 * пополняется по ходу молитвы и пересобирается после нового ответа.
 */
export async function generateFirstQuestion(topic: string, prefetch = false): Promise<GeneratedQuestion | null> {
  const fallback = () => prefetch ? null : fromFallback(pickRandom(currentFallbacks().first));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent({
      ...buildQuestionRequest('first', topic),
      ...(prefetch ? { prefetch: true } : {}),
    });
    const clean = tidy(q.text);
    if (!isQuestion(clean)) warn('firstQuestion', 'Invalid question response', prefetch);
    return isQuestion(clean) && q.novel !== false ? fromAi(clean) : fallback();
  } catch (e) {
    if (prefetch && e instanceof PrefetchDeniedError) return null;
    warn('firstQuestion', e, prefetch);
    return fallback();
  }
}

/**
 * Один новый вопрос, не повторяющий уже заданные.
 * answers передаются только при отдельном answer-context consent — иначе
 * вызывающий обязан передать {}, а transport повторно проверит gate.
 * Индекс ответа сохраняет связь с соответствующим вопросом.
 */
export async function generateQuestion(
  topic: string,
  asked: string[],
  answers: Record<number, AnswerContext> = {},
  skippedQuestions: string[] = [],
  prefetch = false,
): Promise<GeneratedQuestion | null> {
  const fallback = () => prefetch ? null : fromFallback(pickFallbackQuestion([...asked, ...skippedQuestions]));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent({
      ...buildQuestionRequest('next', topic, asked, answers, skippedQuestions),
      ...(prefetch ? { prefetch: true } : {}),
    });
    const clean = tidy(q.text);
    if (!isQuestion(clean)) warn('question', 'Invalid question response', prefetch);
    return isQuestion(clean) ? { ...fromAi(clean), novel: q.novel } : fallback();
  } catch (e) {
    if (prefetch && e instanceof PrefetchDeniedError) return null;
    warn('question', e, prefetch);
    return fallback();
  }
}

/** Вопрос рефлексии по цели и ответам сессии */
export async function generateReflectQuestion(
  topic: string,
  asked: string[],
  answers: Record<number, AnswerContext>,
  skippedQuestions: string[] = [],
  prefetch = false,
): Promise<GeneratedQuestion | null> {
  const fallback = () => prefetch ? null : fromFallback(pickRandom(currentFallbacks().reflect));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent({
      ...buildQuestionRequest('reflect', topic, asked, answers, skippedQuestions),
      ...(prefetch ? { prefetch: true } : {}),
    });
    const clean = tidy(q.text);
    if (!isQuestion(clean)) warn('reflect', 'Invalid question response', prefetch);
    return isQuestion(clean) && q.novel !== false ? fromAi(clean) : fallback();
  } catch (e) {
    if (prefetch && e instanceof PrefetchDeniedError) return null;
    warn('reflect', e, prefetch);
    return fallback();
  }
}
