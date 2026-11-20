const TRAILING_PUNCTUATION = /[\s.,;:!?…。！？；：，]+$/u;

/** Strips trailing phrase punctuation before an explicit continuation ellipsis. */
export function withContinuationEllipsis(text: string): string {
  const trimmed = text.replace(TRAILING_PUNCTUATION, '');
  return `${trimmed} …`;
}

/** Native measurement returns exact text fragments, including spaces and line breaks. */
export function collapsedTextFromLines(lines: readonly string[], lineLimit: number): string {
  return `${lines.slice(0, lineLimit).join('').replace(TRAILING_PUNCTUATION, '')}…`;
}

/** Each fitting step makes the already-cleaned text strictly shorter. */
export function shortenCollapsedText(candidate: string): string {
  if (!candidate.endsWith('…') || candidate === '…') {
    throw new Error('Collapsed text cannot be shortened further');
  }
  const prefix = Array.from(candidate.slice(0, -1)).slice(0, -1).join('');
  return `${prefix.replace(TRAILING_PUNCTUATION, '')}…`;
}
