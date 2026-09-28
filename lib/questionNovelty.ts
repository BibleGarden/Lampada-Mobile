export const normalizeQuestion = (question: string): string =>
  question.normalize('NFKC').toLowerCase().replace(/ё/gu, 'е')
    .replace(/[’'ʼ]/gu, '').replace(/\p{P}/gu, ' ').replace(/\s+/gu, ' ').trim();

export const wasQuestionShown = (question: string, shown: readonly string[]): boolean => {
  const normalized = normalizeQuestion(question);
  return !!normalized && shown.some((previous) => normalizeQuestion(previous) === normalized);
};

export const rememberShownQuestion = (shown: readonly string[], question: string): string[] => {
  const normalized = normalizeQuestion(question);
  if (!normalized) return [...shown];
  return [...shown.filter((previous) => normalizeQuestion(previous) !== normalized), question];
};
