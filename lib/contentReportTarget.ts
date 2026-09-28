import type { ScriptureDisplay } from './scripture';

export type ContentReportTarget = {
  contentType: 'question' | 'scripture';
  contentText: string;
};

export function getContentReportTarget(
  mode: 'question' | 'scripture',
  questionText: string,
  generating: boolean,
  scripture: ScriptureDisplay | undefined,
): ContentReportTarget | null {
  if (mode === 'question') {
    return generating || !questionText.trim()
      ? null
      : { contentType: 'question', contentText: questionText };
  }

  return scripture
    ? {
        contentType: 'scripture',
        contentText: [scripture.reference, scripture.title, scripture.text].filter(Boolean).join('\n\n'),
      }
    : null;
}
