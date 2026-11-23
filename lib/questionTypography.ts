/** Keeps a single-letter preposition on the same line with the following word. */
export function keepShortPrepositions(question: string): string {
  return question.replace(/(^|[\s([{«„])([вксоуіз]) (?=\S)/giu, '$1$2\u00a0');
}
