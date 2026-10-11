/** Однобуквенный предлог остаётся на строке со следующим словом. */
export function keepShortPrepositions(question: string): string {
  return question.replace(/(^|[\s([{«„])([вксоуіз]) (?=\S)/giu, '$1$2\u00a0');
}
