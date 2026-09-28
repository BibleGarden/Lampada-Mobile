export const normalizeQuestion = (question: string): string =>
  question.trim().replace(/\s+/gu, ' ').replace(/[\p{P}]+$/gu, '').trim().toLowerCase();

export const wasQuestionShown = (question: string, shown: readonly string[]): boolean => {
  const normalized = normalizeQuestion(question);
  return !!normalized && shown.some((previous) => normalizeQuestion(previous) === normalized);
};
