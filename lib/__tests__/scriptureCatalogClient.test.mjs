import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScriptureLanguages,
  parseScriptureTranslations,
} from '../scriptureCatalogClient.ts';

test('language catalog keeps API order and national labels', () => {
  const parsed = parseScriptureLanguages([
    { alias: 'ru', name_en: 'Russian', name_national: 'Русский' },
    { alias: 'en', name_en: 'English', name_national: 'English' },
  ]);
  assert.deepEqual(parsed?.map((item) => item.alias), ['ru', 'en']);
  assert.equal(parsed?.[0].nameNational, 'Русский');
});

test('translation catalog exposes only active translations and voices', () => {
  const parsed = parseScriptureTranslations([
    {
      code: 16, alias: 'BSB', name: 'Berean Standard Bible', description: null,
      language: 'en', active: true,
      voices: [
        { code: 151, alias: 'bob', name: 'Bob Souer', description: 'Narrator', is_music: false, active: true },
        { code: 152, alias: 'old', name: 'Old voice', description: null, is_music: false, active: false },
      ],
    },
    {
      code: 17, alias: 'OFF', name: 'Inactive', description: null,
      language: 'en', active: false, voices: [],
    },
  ]);
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0].alias, 'BSB');
  assert.equal(parsed?.[0].name, 'Berean Standard Bible');
  assert.deepEqual(parsed?.[0].voices.map((item) => item.code), [151]);
});

test('catalog parser rejects a broken contract instead of saving invalid ids', () => {
  assert.equal(parseScriptureLanguages([{ alias: 1 }]), null);
  assert.equal(parseScriptureTranslations([{ code: 16, voices: [] }]), null);
});
