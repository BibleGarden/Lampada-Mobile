export function resolveTranscriptionUrl(
  explicitUrl: string | undefined,
  completeUrl: string | undefined,
): string | null {
  if (explicitUrl) return explicitUrl;
  if (!completeUrl) return null;
  const derived = completeUrl.replace(/\/complete\/?$/, '/transcribe');
  return derived === completeUrl ? null : derived;
}

export function deviceLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}
