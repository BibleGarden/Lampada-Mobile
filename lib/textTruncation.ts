/** Убираем завершающие знаки фразы перед явным многоточием продолжения. */
export function withContinuationEllipsis(text: string): string {
  const trimmed = text.replace(/[\s.!?…。！？]+$/u, '');
  return `${trimmed} …`;
}

/** Убираем знак перед нативным многоточием только при однозначном совпадении строки. */
export function withoutPunctuationAtClippedLine(text: string, lastVisibleLine: string): string {
  const line = lastVisibleLine.trimEnd();
  if (!/[.!?…。！？]$/u.test(line)) return text;
  const start = text.indexOf(line);
  if (start < 0 || text.indexOf(line, start + 1) >= 0) return text;
  const punctuation = start + line.length - 1;
  return text.slice(0, punctuation) + text.slice(punctuation + 1);
}
