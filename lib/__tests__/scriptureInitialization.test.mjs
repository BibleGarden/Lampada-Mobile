import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { create } from 'zustand';
import * as preferences from '../scripturePreferences.ts';
import * as uiLanguage from '../uiLanguage.ts';
import * as privacy from '../privacyConsent.ts';
import * as reminders from '../prayerReminders.ts';
import * as duration from '../prayerDuration.ts';

const source = ts.transpileModule(readFileSync(new URL('../settings.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const languages = [
  { alias: 'ru', nameEnglish: 'Russian', nameNational: 'Русский' },
  { alias: 'en', nameEnglish: 'English', nameNational: 'English' },
];
const translation = (language) => ({
  language, code: language === 'ru' ? 1 : 16, alias: language === 'ru' ? 'syn' : 'bsb', name: language,
  voices: [{ code: language === 'ru' ? 1 : 151, alias: language, name: language, isMusic: false }],
});
const selection = (language) => preferences.preferencesFromCatalog(languages.find((l) => l.alias === language),
  translation(language), translation(language).voices[0]);

function fixture(initial = {}, locale = 'en') {
  const rows = new Map(Object.entries(initial));
  const writes = [];
  const diagnostics = [];
  const network = {
    calls: [], failure: null, languages, translations: null, gate: null, onGate: null, translationFailure: null,
  };
  const storage = { writeFailure: null };
  const db = {
    getFirstAsync: async (query) => {
      const key = query.match(/key = '([^']+)'/)[1];
      return rows.has(key) ? { value: rows.get(key) } : null;
    },
    runAsync: async (query, ...params) => {
      if (storage.writeFailure) throw storage.writeFailure;
      const literalKey = query.match(/VALUES \('([^']+)'/);
      const key = literalKey ? literalKey[1] : params[0];
      const value = literalKey ? params[0] : params[1];
      writes.push({ key, value }); rows.set(key, value);
    },
  };
  const dependencies = {
    zustand: { create },
    'expo-localization': { getLocales: () => [{ languageCode: locale }] },
    './db': { getDb: async () => db, recordDiagnostic: (event) => diagnostics.push(event) },
    './uiLanguage': uiLanguage, './scripturePreferences': preferences,
    './privacyConsent': privacy, './prayerReminders': reminders, './prayerDuration': duration,
    './scriptureCatalogClient': {
      fetchScriptureLanguages: async () => {
        network.calls.push('languages');
        if (network.gate) {
          network.onGate?.();
          await network.gate;
        }
        if (network.failure) throw network.failure;
        return network.languages;
      },
      fetchScriptureTranslations: async (language) => {
        network.calls.push(language);
        if (network.translationFailure) throw network.translationFailure;
        if (network.failure) throw network.failure;
        return network.translations ?? [translation(language)];
      },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((name) => {
    assert.ok(dependencies[name], `Unexpected boundary: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { ...module.exports, rows, writes, network, storage, diagnostics };
}

test('local settings load does not invent or persist a Bible selection or require a catalog', async () => {
  const f = fixture({ ui_language: 'ru' });
  f.network.failure = new Error('offline');
  await f.useSettings.getState().load();
  assert.equal(f.useSettings.getState().loaded, true);
  assert.equal(f.useSettings.getState().scripturePreferences, null);
  assert.deepEqual(f.network.calls, []);
  assert.equal(f.rows.has('scripture_preferences'), false);
});

test('catalog failure is explicit, leaves no saved selection, and later recovery chooses the interface language', async () => {
  const f = fixture({ ui_language: 'ru' }, 'en');
  f.network.failure = new Error('offline');
  await assert.rejects(f.ensureScripturePreferences(), /offline/);
  assert.equal(f.rows.has('scripture_preferences'), false);
  assert.equal(f.useSettings.getState().scripturePreferences, null);
  f.network.failure = null;
  assert.equal((await f.ensureScripturePreferences()).preferences.language, 'ru');
  assert.equal(JSON.parse(f.rows.get('scripture_preferences')).language, 'ru');
  assert.deepEqual(f.network.calls, ['languages', 'languages', 'ru']);
});

test('missing interface language or a translation without narration cannot save English', async () => {
  for (const mode of ['language', 'voice']) {
    const f = fixture({ ui_language: 'ru' });
    if (mode === 'language') f.network.languages = [languages[1]];
    else f.network.translations = [{ ...translation('ru'), voices: [] }];
    await assert.rejects(f.ensureScripturePreferences(), (error) => {
      assert.ok(error instanceof f.ScriptureDefaultUnavailableError);
      assert.match(error.message, /Scripture catalog/);
      // Каталог языков отдаётся экрану настроек для ручного выбора.
      assert.deepEqual(error.languages, f.network.languages);
      return true;
    });
    assert.equal(f.rows.has('scripture_preferences'), false);
  }
});

test('initialization returns the catalogs it used so Settings does not request them again', async () => {
  const f = fixture({ ui_language: 'ru' });
  const result = await f.ensureScripturePreferences();
  assert.equal(result.preferences.language, 'ru');
  assert.deepEqual(result.languages, languages);
  assert.deepEqual(result.translations, [translation('ru')]);
  assert.deepEqual(f.network.calls, ['languages', 'ru']);
});

test('a malformed saved selection is reported to diagnostics, not silently treated as absent', async () => {
  const f = fixture({ ui_language: 'ru', scripture_preferences: '{"language":' });
  await f.useSettings.getState().load();
  assert.equal(f.useSettings.getState().scripturePreferences, null);
  assert.deepEqual(f.diagnostics, ['scripture_preferences_invalid']);
});

test('an absent saved selection records no diagnostic', async () => {
  const f = fixture({ ui_language: 'ru' });
  await f.useSettings.getState().load();
  assert.deepEqual(f.diagnostics, []);
});

test('an existing selection is preserved without catalog access despite another interface language', async () => {
  const saved = selection('en');
  const f = fixture({ ui_language: 'ru', scripture_preferences: JSON.stringify(saved) });
  f.network.failure = new Error('offline');
  assert.deepEqual(await f.ensureScripturePreferences(), { preferences: saved, languages: null, translations: null });
  assert.deepEqual(f.network.calls, []);
  assert.equal(f.writes.filter((w) => w.key === 'scripture_preferences').length, 0);
});

test('concurrent initializers share one catalog load and one successful save', async () => {
  const f = fixture({ ui_language: 'ru' });
  const results = await Promise.all([f.ensureScripturePreferences(), f.ensureScripturePreferences()]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(f.network.calls, ['languages', 'ru']);
  assert.equal(f.writes.filter((w) => w.key === 'scripture_preferences').length, 1);
});

test('a manual selection made during initialization wins over the delayed default', async () => {
  const f = fixture({ ui_language: 'ru' });
  let release;
  f.network.gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { f.network.onGate = resolve; });
  const pending = f.ensureScripturePreferences();
  await reached;
  assert.equal(f.network.calls.length, 1);
  await f.useSettings.getState().setScripturePreferences(selection('en'));
  release();
  const result = await pending;
  assert.equal(result.preferences.language, 'en');
  // Каталоги дефолта к явному выбору не относятся и не возвращаются.
  assert.equal(result.translations, null);
  assert.equal(JSON.parse(f.rows.get('scripture_preferences')).language, 'en');
  assert.equal(f.writes.filter((w) => w.key === 'scripture_preferences').length, 1);
});

test('translation request failure does not persist a partially initialized selection', async () => {
  const f = fixture({ ui_language: 'ru' });
  f.network.translationFailure = new Error('translations unavailable');
  await assert.rejects(f.ensureScripturePreferences(), /translations unavailable/);
  assert.equal(f.rows.has('scripture_preferences'), false);
  assert.equal(f.useSettings.getState().scripturePreferences, null);
});

test('an interface language changed while the catalog loads restarts initialization for the new language', async () => {
  const f = fixture({ ui_language: 'ru' });
  let release;
  f.network.gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { f.network.onGate = resolve; });
  const pending = f.ensureScripturePreferences();
  await reached;
  await f.useSettings.getState().setUiLanguage('en');
  release();
  assert.equal((await pending).preferences.language, 'en');
  assert.deepEqual(f.network.calls, ['languages', 'languages', 'en']);
  const writes = f.writes.filter((w) => w.key === 'scripture_preferences');
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0].value).language, 'en');
});

test('catalog errors are typed as catalog unavailability; storage errors keep their own cause', async () => {
  const offline = fixture({ ui_language: 'ru' });
  offline.network.failure = new Error('offline');
  await assert.rejects(offline.ensureScripturePreferences(), (error) => {
    assert.ok(error instanceof offline.ScriptureCatalogUnavailableError);
    return true;
  });
  const full = fixture({ ui_language: 'ru' });
  await full.useSettings.getState().load();
  full.storage.writeFailure = new Error('SQLITE_FULL');
  await assert.rejects(full.ensureScripturePreferences(), (error) => {
    assert.ok(!(error instanceof full.ScriptureCatalogUnavailableError));
    assert.ok(!(error instanceof full.ScriptureDefaultUnavailableError));
    assert.match(error.message, /SQLITE_FULL/);
    return true;
  });
  assert.equal(full.useSettings.getState().scripturePreferences, null);
});

test('an interface language switched during loading is not reported as having no Bible', async () => {
  const f = fixture({ ui_language: 'ru' });
  // В каталоге нет русского: для старого языка это была бы ошибка «нет Библии».
  f.network.languages = [languages[1]];
  let release;
  f.network.gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { f.network.onGate = resolve; });
  const pending = f.ensureScripturePreferences();
  await reached;
  await f.useSettings.getState().setUiLanguage('en');
  release();
  assert.equal((await pending).preferences.language, 'en');
  assert.deepEqual(f.network.calls, ['languages', 'languages', 'en']);
});
