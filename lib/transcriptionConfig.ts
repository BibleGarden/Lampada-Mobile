export function resolveTranscriptionUrl(
  explicitUrl: string | undefined,
  questionUrl: string | undefined,
): string | null {
  if (explicitUrl) return explicitUrl;
  if (!questionUrl) return null;
  const derived = questionUrl.replace(/\/question\/?$/, '/transcribe');
  return derived === questionUrl ? null : derived;
}

export function deviceLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}
