import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPreferencesFromCatalog,
  parseStoredScripturePreferences,
  preferencesFromCatalog,
  resolveInitialScriptureLanguage,
} from '../scripturePreferences.ts';

const language = { alias: 'en', nameEnglish: 'English', nameNational: 'English' };
const voice = {
  code: 151,
  alias: 'bob',
  name: 'Bob Souer',
  description: null,
  isMusic: false,
};
const translation = {
  code: 16,
  alias: 'BSB',
  name: 'Berean Standard Bible',
  description: null,
  language: 'en',
  voices: [voice],
};

test('missing storage remains distinguishable from a saved user selection', () => {
  assert.equal(parseStoredScripturePreferences(null), null);
});

test('stored dependent selection is parsed as one atomic value', () => {
  const preferences = preferencesFromCatalog(language, translation, voice);
  assert.ok(preferences);
  assert.deepEqual(parseStoredScripturePreferences(JSON.stringify(preferences)), preferences);
});

test('catalog selection rejects a voice from another translation', () => {
  assert.equal(
    preferencesFromCatalog(language, translation, { ...voice, code: 999 }),
    null,
  );
});

test('malformed persisted settings are treated as an absent selection', () => {
  assert.equal(parseStoredScripturePreferences('{"language":"en","translationCode":"16"}'), null);
});

test('initial scripture language follows the resolved interface language with no English substitute', () => {
  const languages = [
    { alias: 'en', nameEnglish: 'English', nameNational: 'English' },
    { alias: 'ru', nameEnglish: 'Russian', nameNational: 'Русский' },
  ];
  assert.equal(resolveInitialScriptureLanguage('ru', languages)?.alias, 'ru');
  assert.equal(resolveInitialScriptureLanguage('en', languages)?.alias, 'en');
  assert.equal(resolveInitialScriptureLanguage('uk', languages), null);
  assert.equal(resolveInitialScriptureLanguage('ru', []), null);
});

test('default selection prefers known translation and voice codes', () => {
  assert.deepEqual(defaultPreferencesFromCatalog(language, [translation]), {
    language: 'en',
    languageName: 'English',
    translationCode: 16,
    translationAlias: 'BSB',
    translationName: 'Berean Standard Bible',
    voiceCode: 151,
    voiceAlias: 'bob',
    voiceName: 'Bob Souer',
    voiceIsMusic: false,
  });
});
