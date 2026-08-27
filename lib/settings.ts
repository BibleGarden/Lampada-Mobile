import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { getDb } from './db';
import {
  ENGLISH_SCRIPTURE_PREFERENCES,
  defaultPreferencesFromCatalog,
  parseStoredScripturePreferences,
  resolveInitialScriptureLanguage,
  type ScripturePreferences,
} from './scripturePreferences';
import {
  fetchScriptureLanguages,
  fetchScriptureTranslations,
} from './scriptureCatalogClient';

// Настройки приложения; хранятся в таблице meta (key/value).
//
// shareAnswers управляет только передачей письменных ответов в контекст
// следующих вопросов. Голосовая запись отправляется на расшифровку только
// после отдельного действия пользователя.

type SettingsState = {
  shareAnswers: boolean;
  scripturePreferences: ScripturePreferences;
  loaded: boolean;
  load: () => Promise<void>;
  setShareAnswers: (v: boolean) => Promise<void>;
  setScripturePreferences: (preferences: ScripturePreferences) => Promise<void>;
};

let loadPromise: Promise<void> | null = null;

export const useSettings = create<SettingsState>((set) => ({
  shareAnswers: true,
  scripturePreferences: ENGLISH_SCRIPTURE_PREFERENCES,
  loaded: false,

  load: async () => {
    if (useSettings.getState().loaded) return;
    if (!loadPromise) {
      loadPromise = (async () => {
        const d = await getDb();
        const [shareRow, scriptureRow] = await Promise.all([
          d.getFirstAsync<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'share_answers'",
          ),
          d.getFirstAsync<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'scripture_preferences'",
          ),
        ]);
        // Для новых установок записи ещё нет — используем включённое значение
        // по умолчанию. Явно сохранённый "0" остаётся выбором пользователя.
        const storedPreferences = parseStoredScripturePreferences(scriptureRow?.value ?? null);
        let scripturePreferences = storedPreferences;
        if (!scripturePreferences) {
          try {
            const languages = await fetchScriptureLanguages();
            const deviceLocale = getLocales()[0];
            const language = resolveInitialScriptureLanguage(deviceLocale, languages);
            if (language) {
              const translations = await fetchScriptureTranslations(language.alias);
              scripturePreferences = defaultPreferencesFromCatalog(language, translations);
            }
          } catch {
            // Without a confirmed server catalog, English is the deterministic fallback.
          }
          scripturePreferences ??= ENGLISH_SCRIPTURE_PREFERENCES;
          await d.runAsync(
            `INSERT INTO meta (key, value) VALUES ('scripture_preferences', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            JSON.stringify(scripturePreferences),
          );
        }
        set({
          shareAnswers: shareRow?.value !== '0',
          scripturePreferences,
          loaded: true,
        });
      })().catch((error) => {
        loadPromise = null;
        throw error;
      });
    }
    await loadPromise;
  },

  setShareAnswers: async (v) => {
    set({ shareAnswers: v }); // мгновенно для UI, запись — следом
    const d = await getDb();
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('share_answers', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      v ? '1' : '0',
    );
  },

  setScripturePreferences: async (preferences) => {
    const d = await getDb();
    // Persist the dependent triple as one value: readers can never observe a
    // language combined with a translation or voice from another catalog.
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('scripture_preferences', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(preferences),
    );
    set({ scripturePreferences: preferences });
  },
}));

/** Текущее значение для не-React кода (store), без подписки */
export const shareAnswersNow = () => useSettings.getState().shareAnswers;

/** Current validated Bible selection for non-React request code. */
export const scripturePreferencesNow = () => useSettings.getState().scripturePreferences;

/** Privacy barrier for non-React code: persisted opt-out is loaded before networking. */
export const ensureSettingsLoaded = async () => {
  if (!useSettings.getState().loaded) await useSettings.getState().load();
};
