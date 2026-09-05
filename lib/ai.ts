// AI-слой: вопросы Спутника и вопрос рефлексии по заданной пользователем цели.
//
// Сетевая часть живёт в llm.ts; здесь — промпты и правило деградации:
// любая ошибка (прокси не настроен, сеть, таймаут, кривой ответ) тихо
// откатывает на курируемые пулы из прототипа. Молитва важнее генерации —
// экраны никогда не ждут ИИ дольше таймаута и никогда не видят ошибку.

import { completePrayerContent, llmConfigured } from './llm';
import { coreAiAllowedNow, useSettings } from './settings';
import { fallbackQuestions } from './locales/fallbackQuestions';
import { buildQuestionRequest } from './questionRequest';
import type { AnswerContext } from './answerContext';

export type QuestionSource = 'ai' | 'fallback';
export type GeneratedQuestion = { text: string; source: QuestionSource };

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
const warn = (where: string, e: unknown) =>
  console.warn(`[ai] ${where}: using fallback pool —`, e instanceof Error ? e.message : e);

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
export async function generateFirstQuestion(topic: string): Promise<GeneratedQuestion> {
  if (!llmConfigured() || !coreAiAllowedNow()) return fromFallback(pickRandom(currentFallbacks().first));
  try {
    const q = await completePrayerContent(buildQuestionRequest('first', topic));
    const clean = tidy(q);
    if (!isQuestion(clean)) warn('firstQuestion', 'Invalid question response');
    return isQuestion(clean) ? fromAi(clean) : fromFallback(pickRandom(currentFallbacks().first));
  } catch (e) {
    warn('firstQuestion', e);
    return fromFallback(pickRandom(currentFallbacks().first));
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
): Promise<GeneratedQuestion> {
  const fallback = () => fromFallback(pickFallbackQuestion(asked));
  if (!llmConfigured() || !coreAiAllowedNow()) return fallback();
  try {
    const q = await completePrayerContent(buildQuestionRequest('next', topic, asked, answers));
    const clean = tidy(q);
    if (!isQuestion(clean)) warn('question', 'Invalid question response');
    return isQuestion(clean) ? fromAi(clean) : fallback();
  } catch (e) {
    warn('question', e);
    return fallback();
  }
}

/** Вопрос рефлексии по цели и ответам сессии */
export async function generateReflectQuestion(
  topic: string,
  asked: string[],
  answers: Record<number, AnswerContext>,
): Promise<GeneratedQuestion> {
  if (!llmConfigured() || !coreAiAllowedNow()) return fromFallback(pickRandom(currentFallbacks().reflect));
  try {
    const q = await completePrayerContent(buildQuestionRequest('reflect', topic, asked, answers));
    const clean = tidy(q);
    if (!isQuestion(clean)) warn('reflect', 'Invalid question response');
    return isQuestion(clean) ? fromAi(clean) : fromFallback(pickRandom(currentFallbacks().reflect));
  } catch (e) {
    warn('reflect', e);
    return fromFallback(pickRandom(currentFallbacks().reflect));
  }
}
