import assert from 'node:assert/strict';
import test from 'node:test';
import { privacyPolicyUrl } from '../publicUrls.ts';

for (const language of ['en', 'ru', 'uk']) {
  test(`privacy policy uses the app's ${language} language`, () => {
    assert.equal(privacyPolicyUrl(language), `https://lampada.app/privacy?lang=${language}`);
  });
}
