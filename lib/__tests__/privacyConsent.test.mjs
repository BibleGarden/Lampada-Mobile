import assert from 'node:assert/strict';
import test from 'node:test';

import { componentMessages } from '../locales/components.ts';
import { screenMessages } from '../locales/screens.ts';
import { settingMessages } from '../locales/settings.ts';
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

test('a former Gemini-era allowance does not carry over', () => {
  const geminiAllowance = JSON.stringify({
    decision: 'allowed',
    noticeVersion: 1,
    providerContract: 'google-gemini-paid-2026-09',
  });
  assert.equal(resolveConsentDecision(geminiAllowance), 'undecided');
});

test('every decision under the company-hosted notice requires a new decision', () => {
  assert.equal(PRIVACY_NOTICE_VERSION, 3);
  assert.equal(PRIVACY_PROVIDER_CONTRACT, 'google-gemini-paid-whisper-self-hosted-2026-09');
  for (const decision of ['allowed', 'denied', 'undecided']) {
    const oldRecord = JSON.stringify({
      decision,
      noticeVersion: 2,
      providerContract: 'company-hosted-ai-2026-09',
    });
    assert.equal(resolveConsentDecision(oldRecord), 'undecided');
  }
});

test('each locale names the processors in the consent dialog and settings', () => {
  const audioAlternatives = {
    en: /Whisper.*or Google Gemini/,
    ru: /Whisper.*или в Google Gemini/,
    uk: /Whisper.*або до Google Gemini/,
  };
  for (const locale of ['en', 'ru', 'uk']) {
    const dialog = componentMessages[locale];
    const settings = settingMessages[locale];
    for (const key of ['components.reader.aiBody', 'components.reader.answerBody']) {
      assert.match(dialog[key], /Google Gemini/);
    }
    for (const key of ['settings.topicConsentHint', 'settings.answersConsentHint']) {
      assert.match(settings[key], /Google Gemini/);
    }
    assert.match(dialog['components.reader.audioBody'], audioAlternatives[locale]);
    assert.match(settings['settings.transcriptionConsentHint'], /Whisper/);
    assert.match(settings['settings.transcriptionConsentHint'], /Google Gemini/);
    assert.match(settings['settings.privacyDetails'], /Whisper/);
    assert.match(settings['settings.privacyDetails'], /Google Gemini/);
    assert.match(settings['settings.privacyHint'], /permission|разрешения|дозволу/);
    assert.match(screenMessages[locale]['screens.threshold.answers.allowed'], /Google Gemini/);
    assert.match(screenMessages[locale]['screens.threshold.answers.undecided'], /Google Gemini/);
    assert.doesNotMatch(screenMessages[locale]['screens.threshold.answers.allowed'], /\.$/);
    assert.doesNotMatch(screenMessages[locale]['screens.threshold.answers.undecided'], /\.$/);
    assert.doesNotMatch(dialog['components.reader.audioBody'], /Google (?:does not receive|не получает|не отримує)/);
  }
});

test('only allowed opens a content-transfer gate', () => {
  assert.equal(consentAllowsTransfer('undecided'), false);
  assert.equal(consentAllowsTransfer('denied'), false);
  assert.equal(consentAllowsTransfer('allowed'), true);
});
