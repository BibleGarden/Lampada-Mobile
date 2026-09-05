import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRIVACY_NOTICE_VERSION,
  PRIVACY_PROVIDER_CONTRACT,
  consentAllowsTransfer,
  parseConsentRecord,
  resolveConsentDecision,
  serializeConsentRecord,
} from '../privacyConsent.ts';

test('current versioned consent round-trips', () => {
  const stored = serializeConsentRecord('allowed');
  assert.deepEqual(parseConsentRecord(stored), {
    decision: 'allowed',
    noticeVersion: PRIVACY_NOTICE_VERSION,
    providerContract: PRIVACY_PROVIDER_CONTRACT,
  });
  assert.equal(resolveConsentDecision(stored), 'allowed');
});

test('missing and permissive legacy answer values remain undecided', () => {
  assert.equal(resolveConsentDecision(null), 'undecided');
  assert.equal(resolveConsentDecision(null, '1'), 'undecided');
});

test('an explicit legacy answer opt-out migrates to denied', () => {
  assert.equal(resolveConsentDecision(null, '0'), 'denied');
});

test('malformed and obsolete records cannot allow a transfer', () => {
  const obsolete = JSON.stringify({
    decision: 'allowed',
    noticeVersion: PRIVACY_NOTICE_VERSION - 1,
    providerContract: PRIVACY_PROVIDER_CONTRACT,
  });
  const wrongProvider = JSON.stringify({
    decision: 'allowed',
    noticeVersion: PRIVACY_NOTICE_VERSION,
    providerContract: 'another-provider',
  });
  assert.equal(resolveConsentDecision('{bad json'), 'undecided');
  assert.equal(resolveConsentDecision(obsolete), 'undecided');
  assert.equal(resolveConsentDecision(wrongProvider), 'undecided');
});

test('a Gemini-era allowance does not carry over to company-hosted models', () => {
  const geminiAllowance = JSON.stringify({
    decision: 'allowed',
    noticeVersion: 1,
    providerContract: 'google-gemini-paid-2026-09',
  });
  assert.equal(resolveConsentDecision(geminiAllowance), 'undecided');
});

test('only allowed opens a content-transfer gate', () => {
  assert.equal(consentAllowsTransfer('undecided'), false);
  assert.equal(consentAllowsTransfer('denied'), false);
  assert.equal(consentAllowsTransfer('allowed'), true);
});
