import assert from 'node:assert/strict';
import test from 'node:test';
import { openExternalUrl } from '../externalLink.ts';
import { privacyPolicyUrl } from '../publicUrls.ts';
import { systemMessages } from '../locales/system.ts';

for (const language of ['en', 'ru', 'uk']) {
  test(`privacy policy link opens the ${language} URL`, async () => {
    const calls = [];
    await openExternalUrl(privacyPolicyUrl(language), key => systemMessages[language][key],
      async url => { calls.push(url); }, () => { throw new Error('Unexpected alert'); });
    assert.deepEqual(calls, [`https://lampada.app/privacy?lang=${language}`]);
  });
  test(`failed external link shows the ${language} alert`, async () => {
    const alerts = [];
    await openExternalUrl(privacyPolicyUrl(language), key => systemMessages[language][key],
      async () => { throw new Error('browser unavailable'); }, (title, message) => alerts.push([title, message]));
    assert.deepEqual(alerts, [[systemMessages[language]['externalLink.openFailed'],
      systemMessages[language]['externalLink.tryAgain']]]);
  });
}
