export type ConsentDecision = 'undecided' | 'allowed' | 'denied';

export type ConsentPurpose =
  | 'core_prayer_ai'
  | 'answer_context'
  | 'audio_transcription';

export type ConsentRecord = {
  decision: ConsentDecision;
  noticeVersion: number;
  providerContract: string;
};

export const PRIVACY_NOTICE_VERSION = 2;
export const PRIVACY_PROVIDER_CONTRACT = 'company-hosted-ai-2026-09';

const decisions = new Set<ConsentDecision>(['undecided', 'allowed', 'denied']);

export const currentConsentRecord = (decision: ConsentDecision): ConsentRecord => ({
  decision,
  noticeVersion: PRIVACY_NOTICE_VERSION,
  providerContract: PRIVACY_PROVIDER_CONTRACT,
});

export function parseConsentRecord(value: string | null): ConsentRecord | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('decision' in parsed) ||
      !decisions.has(parsed.decision as ConsentDecision) ||
      !('noticeVersion' in parsed) ||
      parsed.noticeVersion !== PRIVACY_NOTICE_VERSION ||
      !('providerContract' in parsed) ||
      parsed.providerContract !== PRIVACY_PROVIDER_CONTRACT
    ) {
      return null;
    }
    return parsed as ConsentRecord;
  } catch {
    return null;
  }
}

export const serializeConsentRecord = (decision: ConsentDecision) =>
  JSON.stringify(currentConsentRecord(decision));

/**
 * Resolve a stored consent value under the current notice and provider terms.
 * Existing answer-context opt-outs are the only legacy value that survives:
 * permissive, missing, malformed and obsolete values never become allowed.
 */
export function resolveConsentDecision(
  storedValue: string | null,
  legacyShareAnswers?: string | null,
): ConsentDecision {
  const current = parseConsentRecord(storedValue);
  if (current) return current.decision;
  if (storedValue === null && legacyShareAnswers === '0') return 'denied';
  return 'undecided';
}

export const consentAllowsTransfer = (decision: ConsentDecision) => decision === 'allowed';
