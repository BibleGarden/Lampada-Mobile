import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { getDb } from './db';
import { initialUiLanguage, isUiLanguage, type UiLanguage } from './uiLanguage';
import {
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
import {
  DEFAULT_PRAYER_MINUTES,
  parseStoredPrayerMinutes,
  serializePrayerMinutes,
} from './prayerDuration';

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
  scripturePreferences: ScripturePreferences | null;
  reminderSchedule: ReminderSchedule;
  prayerMinutes: number; // длительность последней начатой молитвы; 0 = без таймера
  loaded: boolean;
  load: () => Promise<void>;
  setConsent: (purpose: ConsentPurpose, decision: Exclude<ConsentDecision, 'undecided'>) => Promise<void>;
  setScripturePreferences: (preferences: ScripturePreferences) => Promise<void>;
  setReminderSchedule: (schedule: ReminderSchedule) => Promise<void>;
  setPrayerMinutes: (minutes: number) => Promise<void>;
};

let languageSavePromise: Promise<void> = Promise.resolve();
let loadPromise: Promise<void> | null = null;
let consentSavePromise: Promise<void> = Promise.resolve();
let scriptureSavePromise: Promise<void> = Promise.resolve();
let scriptureInitializationPromise: Promise<ScripturePreferences> | null = null;

export const useSettings = create<SettingsState>((set) => ({
  uiLanguage: initialUiLanguage(getLocales()),
  uiLanguageReady: false,
  coreAiConsent: 'undecided',
  answerContextConsent: 'undecided',
  audioTranscriptionConsent: 'undecided',
  scripturePreferences: null,
  reminderSchedule: DEFAULT_REMINDER_SCHEDULE,
  prayerMinutes: DEFAULT_PRAYER_MINUTES,
  loaded: false,

  load: async () => {
    if (useSettings.getState().loaded) return;
    if (!loadPromise) {
      loadPromise = (async () => {
        const d = await getDb();
        const [coreRow, answerRow, audioRow, legacyShareRow, scriptureRow, remindersRow, languageRow, minutesRow] = await Promise.all([
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
          d.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'prayer_minutes'"),
        ]);
        // Длительность публикуется вместе с языком: корневой layout показывает
        // экраны после uiLanguageReady, и первый сброс сессии на Home уже
        // видит сохранённое значение.
        set({
          uiLanguage: isUiLanguage(languageRow?.value) ? languageRow.value : initialUiLanguage(getLocales()),
          prayerMinutes: parseStoredPrayerMinutes(minutesRow?.value ?? null),
          uiLanguageReady: true,
        });
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
        set({
          coreAiConsent,
          answerContextConsent,
          audioTranscriptionConsent,
          scripturePreferences: storedPreferences,
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
    await persistScripturePreferences(preferences);
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

  setPrayerMinutes: async (minutes) => {
    const d = await getDb();
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('prayer_minutes', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      serializePrayerMinutes(minutes),
    );
    set({ prayerMinutes: minutes });
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
  scriptureSavePromise = Promise.resolve();
  scriptureInitializationPromise = null;
  languageSavePromise = Promise.resolve();
  useSettings.setState({
    uiLanguage: initialUiLanguage(getLocales()),
    uiLanguageReady: true,
    coreAiConsent: 'undecided',
    answerContextConsent: 'undecided',
    audioTranscriptionConsent: 'undecided',
    scripturePreferences: null,
    reminderSchedule: DEFAULT_REMINDER_SCHEDULE,
    prayerMinutes: DEFAULT_PRAYER_MINUTES,
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
const scripturePreferencesNow = () => {
  const preferences = useSettings.getState().scripturePreferences;
  if (!preferences) throw new Error('Scripture preferences have not been initialized');
  return preferences;
};

/** Privacy barrier for non-React code: persisted opt-out is loaded before networking. */
export const ensureSettingsLoaded = async () => {
  if (!useSettings.getState().loaded) await useSettings.getState().load();
};

// Сохраняем зависимую тройку последовательно: поздний дефолт не должен
// перезаписать явный выбор, сделанный человеком во время загрузки каталога.
async function persistScripturePreferences(
  preferences: ScripturePreferences,
  onlyIfUnset = false,
  initialLanguage?: UiLanguage,
) {
  scriptureSavePromise = scriptureSavePromise.catch(() => undefined).then(async () => {
    if (onlyIfUnset && useSettings.getState().scripturePreferences) return;
    const d = await getDb();
    if (initialLanguage && useSettings.getState().uiLanguage !== initialLanguage) {
      throw new Error('Interface language changed during scripture initialization');
    }
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('scripture_preferences', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(preferences),
    );
    useSettings.setState({ scripturePreferences: preferences });
  });
  await scriptureSavePromise;
}

/** Не сохраняем никакого выбора до подтверждения языка и полной тройки каталогом. */
export async function ensureScripturePreferences(): Promise<ScripturePreferences> {
  await ensureSettingsLoaded();
  const saved = useSettings.getState().scripturePreferences;
  if (saved) return saved;
  if (!scriptureInitializationPromise) {
    const interfaceLanguage = useSettings.getState().uiLanguage;
    const pending = (async () => {
      const languages = await fetchScriptureLanguages();
      const language = resolveInitialScriptureLanguage(interfaceLanguage, languages);
      if (!language) throw new Error('Scripture catalog does not contain the interface language');
      const translations = await fetchScriptureTranslations(language.alias);
      const preferences = defaultPreferencesFromCatalog(language, translations);
      if (!preferences) throw new Error('Scripture catalog has no valid translation and voice');
      await persistScripturePreferences(preferences, true, interfaceLanguage);
      return scripturePreferencesNow();
    })();
    scriptureInitializationPromise = pending;
    void pending.finally(() => {
      if (scriptureInitializationPromise === pending) scriptureInitializationPromise = null;
    }).catch(() => undefined);
  }
  return scriptureInitializationPromise;
}
