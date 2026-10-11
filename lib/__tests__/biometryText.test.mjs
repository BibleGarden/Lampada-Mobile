import assert from 'node:assert/strict';
import test from 'node:test';
import { biometryKind, biometryText } from '../lockPolicy.ts';
import { securityComponentMessages } from '../locales/securityComponents.ts';
import { settingMessages } from '../locales/settings.ts';
import { systemMessages } from '../locales/system.ts';

const translator = (language) => (key, params = {}) => {
  const message = { ...securityComponentMessages[language], ...settingMessages[language], ...systemMessages[language] }[key];
  assert.equal(typeof message, 'string', `${language}: ${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name) => params[name]);
};
const texts = ['label', 'confirm', 'enableError', 'orUnlock', 'unlock'];
const kinds = ['face', 'finger', 'other'];
const render = (platform, language) => Object.fromEntries(kinds.map((kind) =>
  [kind, texts.map((text) => biometryText(platform, kind, text, translator(language)))]));

test('iOS fills the shared templates with the Apple names', () => {
  assert.deepEqual(render('ios', 'en'), {
    face: ['Face ID', 'Confirm enabling Face ID', 'Could not enable Face ID', 'Or sign in with Face ID', 'Sign in with Face ID'],
    finger: ['Touch ID', 'Confirm enabling Touch ID', 'Could not enable Touch ID', 'Or sign in with Touch ID', 'Sign in with Touch ID'],
    other: ['Face ID / Touch ID', 'Confirm enabling Face ID / Touch ID', 'Could not enable Face ID / Touch ID',
      'Or sign in with Face ID / Touch ID', 'Sign in with Face ID / Touch ID'],
  });
  assert.deepEqual(render('ios', 'ru').face,
    ['Face ID', 'Подтвердите включение Face ID', 'Не удалось включить Face ID', 'Или войдите через Face ID', 'Войти через Face ID']);
});

test('Android uses a complete phrase per method in every interface language', () => {
  assert.deepEqual(render('android', 'en'), {
    face: ['Face unlock', 'Confirm enabling face unlock', 'Could not enable face unlock', 'Or sign in with face unlock', 'Sign in with face unlock'],
    finger: ['Fingerprint', 'Confirm enabling fingerprint unlock', 'Could not enable fingerprint unlock', 'Or sign in with your fingerprint', 'Sign in with your fingerprint'],
    other: ['Biometrics', 'Confirm enabling biometric unlock', 'Could not enable biometric unlock', 'Or sign in with biometrics', 'Sign in with biometrics'],
  });
  assert.deepEqual(render('android', 'ru'), {
    face: ['Распознавание лица', 'Подтвердите включение входа по лицу', 'Не удалось включить вход по лицу', 'Или войдите по лицу', 'Войти по лицу'],
    finger: ['Отпечаток пальца', 'Подтвердите включение входа по отпечатку пальца', 'Не удалось включить вход по отпечатку пальца',
      'Или войдите по отпечатку пальца', 'Войти по отпечатку пальца'],
    other: ['Биометрия', 'Подтвердите включение входа по биометрии', 'Не удалось включить вход по биометрии', 'Или войдите по биометрии', 'Войти по биометрии'],
  });
  assert.deepEqual(render('android', 'uk'), {
    face: ['Розпізнавання обличчя', 'Підтвердьте ввімкнення входу за обличчям', 'Не вдалося ввімкнути вхід за обличчям',
      'Або увійдіть за обличчям', 'Увійти за обличчям'],
    finger: ['Відбиток пальця', 'Підтвердьте ввімкнення входу за відбитком пальця', 'Не вдалося ввімкнути вхід за відбитком пальця',
      'Або увійдіть за відбитком пальця', 'Увійти за відбитком пальця'],
    other: ['Біометрія', 'Підтвердьте ввімкнення входу за біометрією', 'Не вдалося ввімкнути вхід за біометрією',
      'Або увійдіть за біометрією', 'Увійти за біометрією'],
  });
});

test('the method is named only when the system prompt can offer just that one', () => {
  // 1 — отпечаток, 2 — лицо, 3 — радужка (AuthenticationType).
  assert.equal(biometryKind('ios', [2]), 'face');
  assert.equal(biometryKind('ios', [1]), 'finger');
  assert.equal(biometryKind('ios', []), 'other');
  assert.equal(biometryKind('android', [1]), 'finger');
  assert.equal(biometryKind('android', [2]), 'face');
  assert.equal(biometryKind('android', [1, 2]), 'other');
  assert.equal(biometryKind('android', [3]), 'other');
  assert.equal(biometryKind('android', []), 'other');
});
