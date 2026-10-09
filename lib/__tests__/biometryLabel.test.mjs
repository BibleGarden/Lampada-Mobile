import assert from 'node:assert/strict';
import test from 'node:test';
import { biometryLabel } from '../lockPolicy.ts';
import { settingMessages } from '../locales/settings.ts';
import { systemMessages } from '../locales/system.ts';

const apple = /Face ID|Touch ID/;
const languages = ['en', 'ru', 'uk'];
const translator = (language) => (key) => {
  const message = systemMessages[language][key];
  assert.equal(typeof message, 'string', `${language}: ${key}`);
  return message;
};

test('iOS keeps the Apple names of its biometric methods', () => {
  const translate = translator('en');
  assert.equal(biometryLabel('ios', 'face', translate), 'Face ID');
  assert.equal(biometryLabel('ios', 'finger', translate), 'Touch ID');
  assert.equal(biometryLabel('ios', 'other', translate), 'Face ID / Touch ID');
});

test('Android names biometric methods without Apple terms in every UI language', () => {
  for (const language of languages) {
    const labels = ['face', 'finger', 'other'].map((kind) => biometryLabel('android', kind, translator(language)));
    assert.deepEqual(labels, [
      systemMessages[language]['system.face'],
      systemMessages[language]['system.finger'],
      systemMessages[language]['system.biometrics'],
    ]);
    for (const label of labels) assert.doesNotMatch(label, apple, `${language}: ${label}`);
  }
});

test('the enable error names the method shown on the platform', () => {
  for (const language of languages) {
    const message = settingMessages[language]['settings.biometricsError'];
    assert.match(message, /\{name\}/, language);
    assert.doesNotMatch(message, apple, language);
  }
});
