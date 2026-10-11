const TRAILING_PUNCTUATION = /[\s.,;:!?…。！？；：，]+$/u;

/** Убираем завершающие знаки фразы перед явным многоточием продолжения. */
export function withContinuationEllipsis(text: string): string {
  const trimmed = text.replace(TRAILING_PUNCTUATION, '');
  return `${trimmed} …`;
}

/** Нативное измерение возвращает точные фрагменты текста, включая пробелы и переносы. */
export function collapsedTextFromLines(lines: readonly string[], lineLimit: number): string {
  return `${lines.slice(0, lineLimit).join('').replace(TRAILING_PUNCTUATION, '')}…`;
}

/** Каждый шаг подгонки делает уже очищенный текст строго короче. */
export function shortenCollapsedText(candidate: string): string {
  if (!candidate.endsWith('…') || candidate === '…') {
    throw new Error('Collapsed text cannot be shortened further');
  }
  const prefix = Array.from(candidate.slice(0, -1)).slice(0, -1).join('');
  return `${prefix.replace(TRAILING_PUNCTUATION, '')}…`;
}
