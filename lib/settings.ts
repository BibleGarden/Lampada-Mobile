import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { getDb } from './db';
import { initialUiLanguage, isUiLanguage, type UiLanguage } from './uiLanguage';
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
import {
  DEFAULT_REMINDER_SCHEDULE,
  parseStoredReminderSchedule,
  type ReminderSchedule,
} from './prayerReminders';
import {
  consentAllowsTransfer,
  resolveConsentDecision,
  serializeConsentRecord,
  type ConsentDecision,
  type ConsentPurpose,
} from './privacyConsent';

// Настройки приложения; хранятся в таблице meta (key/value).
//
// Каждая передача молитвенного контента имеет независимое versioned-согласие.
// Отсутствие записи и старые разрешающие значения никогда не означают consent.

const CONSENT_KEYS: Record<ConsentPurpose, string> = {
  core_prayer_ai: 'privacy_consent_core_prayer_ai',
  answer_context: 'privacy_consent_answer_context',
  audio_transcription: 'privacy_consent_audio_transcription',
};

type SettingsState = {
  uiLanguage: UiLanguage;
  uiLanguageReady: boolean;
  setUiLanguage: (language: UiLanguage) => Promise<void>;
  coreAiConsent: ConsentDecision;
  answerContextConsent: ConsentDecision;
  audioTranscriptionConsent: ConsentDecision;
  scripturePreferences: ScripturePreferences;
  reminderSchedule: ReminderSchedule;
  loaded: boolean;
  load: () => Promise<void>;
  setConsent: (purpose: ConsentPurpose, decision: Exclude<ConsentDecision, 'undecided'>) => Promise<void>;
  setScripturePreferences: (preferences: ScripturePreferences) => Promise<void>;
  setReminderSchedule: (schedule: ReminderSchedule) => Promise<void>;
};

let languageSavePromise: Promise<void> = Promise.resolve();
let loadPromise: Promise<void> | null = null;
let consentSavePromise: Promise<void> = Promise.resolve();

export const useSettings = create<SettingsState>((set) => ({
  uiLanguage: initialUiLanguage(getLocales()),
  uiLanguageReady: false,
  coreAiConsent: 'undecided',
  answerContextConsent: 'undecided',
  audioTranscriptionConsent: 'undecided',
  scripturePreferences: ENGLISH_SCRIPTURE_PREFERENCES,
  reminderSchedule: DEFAULT_REMINDER_SCHEDULE,
  loaded: false,

  load: async () => {
    if (useSettings.getState().loaded) return;
    if (!loadPromise) {
      loadPromise = (async () => {
        const d = await getDb();
        const [coreRow, answerRow, audioRow, legacyShareRow, scriptureRow, remindersRow, languageRow] = await Promise.all([
          d.getFirstAsync<{ value: string }>(
            `SELECT value FROM meta WHERE key = '${CONSENT_KEYS.core_prayer_ai}'`,
          ),
          d.getFirstAsync<{ value: string }>(
            `SELECT value FROM meta WHERE key = '${CONSENT_KEYS.answer_context}'`,
          ),
          d.getFirstAsync<{ value: string }>(
            `SELECT value FROM meta WHERE key = '${CONSENT_KEYS.audio_transcription}'`,
          ),
          d.getFirstAsync<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'share_answers'",
          ),
          d.getFirstAsync<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'scripture_preferences'",
          ),
          d.getFirstAsync<{ value: string }>(
            "SELECT value FROM meta WHERE key = 'prayer_reminders'",
          ),
          d.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'ui_language'"),
        ]);
        set({ uiLanguage: isUiLanguage(languageRow?.value) ? languageRow.value : initialUiLanguage(getLocales()), uiLanguageReady: true });
        const coreAiConsent = resolveConsentDecision(coreRow?.value ?? null);
        const answerContextConsent = resolveConsentDecision(
          answerRow?.value ?? null,
          legacyShareRow?.value ?? null,
        );
        const audioTranscriptionConsent = resolveConsentDecision(audioRow?.value ?? null);
        // Нормализуем отсутствующие, malformed и obsolete записи сразу. Так
        // последующие чтения не зависят от legacy-ключа и версии приложения.
        await Promise.all([
          d.runAsync(
            `INSERT INTO meta (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            CONSENT_KEYS.core_prayer_ai,
            serializeConsentRecord(coreAiConsent),
          ),
          d.runAsync(
            `INSERT INTO meta (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            CONSENT_KEYS.answer_context,
            serializeConsentRecord(answerContextConsent),
          ),
          d.runAsync(
            `INSERT INTO meta (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            CONSENT_KEYS.audio_transcription,
            serializeConsentRecord(audioTranscriptionConsent),
          ),
        ]);
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
          coreAiConsent,
          answerContextConsent,
          audioTranscriptionConsent,
          scripturePreferences,
          // Расписание по умолчанию статично, поэтому его отсутствие не нужно
          // дописывать в meta: запись появится с первой правкой пользователя.
          reminderSchedule:
            parseStoredReminderSchedule(remindersRow?.value ?? null) ?? DEFAULT_REMINDER_SCHEDULE,
          loaded: true,
        });
      })().catch((error) => {
        set({ uiLanguageReady: true });
        loadPromise = null;
        throw error;
      });
    }
    await loadPromise;
  },

  setUiLanguage: async (language) => {
    if (!isUiLanguage(language)) throw new Error('Unsupported interface language');
    languageSavePromise = languageSavePromise.catch(() => undefined).then(async () => {
      const d = await getDb();
      await d.runAsync(
        `INSERT INTO meta (key, value) VALUES ('ui_language', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        language,
      );
      set({ uiLanguage: language });
    });
    await languageSavePromise;
  },

  setConsent: async (purpose, decision) => {
    const stateKey = purpose === 'core_prayer_ai'
      ? 'coreAiConsent'
      : purpose === 'answer_context'
        ? 'answerContextConsent'
        : 'audioTranscriptionConsent';
    const previousDecision = useSettings.getState()[stateKey];
    // Сначала закрываем барьер в памяти: отзыв уже действует для следующего
    // request builder, даже пока SQLite завершает запись.
    set({ [stateKey]: decision } as Pick<SettingsState, typeof stateKey>);
    consentSavePromise = consentSavePromise.catch(() => undefined).then(async () => {
      const d = await getDb();
      await d.runAsync(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        CONSENT_KEYS[purpose],
        serializeConsentRecord(decision),
      );
    });
    try {
      await consentSavePromise;
    } catch (error) {
      if (useSettings.getState()[stateKey] === decision) {
        set({ [stateKey]: previousDecision } as Pick<SettingsState, typeof stateKey>);
      }
      throw error;
    }
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

  setReminderSchedule: async (schedule) => {
    const d = await getDb();
    // Флаг включения, дни и времена — одно зависимое значение: читатель не
    // может увидеть включённые напоминания с полурасписанием.
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('prayer_reminders', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(schedule),
    );
    set({ reminderSchedule: schedule });
  },
}));

/**
 * Вернуть настройки к состоянию новой установки. Нужен только полному стиранию
 * данных: база к этому моменту удалена, поэтому в памяти не должно остаться ни
 * значений из неё, ни закэшированного промиса загрузки — иначе `load()` решил
 * бы, что настройки уже прочитаны.
 */
export const resetSettingsStore = () => {
  loadPromise = null;
  consentSavePromise = Promise.resolve();
  languageSavePromise = Promise.resolve();
  useSettings.setState({
    uiLanguage: initialUiLanguage(getLocales()),
    uiLanguageReady: true,
    coreAiConsent: 'undecided',
    answerContextConsent: 'undecided',
    audioTranscriptionConsent: 'undecided',
    scripturePreferences: ENGLISH_SCRIPTURE_PREFERENCES,
    reminderSchedule: DEFAULT_REMINDER_SCHEDULE,
    loaded: false,
  });
};

/** Текущие privacy-барьеры для не-React кода, без подписки. */
export const coreAiAllowedNow = () =>
  consentAllowsTransfer(useSettings.getState().coreAiConsent);

export const answerContextAllowedNow = () =>
  consentAllowsTransfer(useSettings.getState().answerContextConsent);

export const audioTranscriptionAllowedNow = () =>
  consentAllowsTransfer(useSettings.getState().audioTranscriptionConsent);

/** Current validated Bible selection for non-React request code. */
export const scripturePreferencesNow = () => useSettings.getState().scripturePreferences;

/** Privacy barrier for non-React code: persisted opt-out is loaded before networking. */
export const ensureSettingsLoaded = async () => {
  if (!useSettings.getState().loaded) await useSettings.getState().load();
};
