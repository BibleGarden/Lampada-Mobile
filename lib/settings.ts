import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { errorKind, getDb, recordDiagnostic } from './db';
import { initialUiLanguage, isUiLanguage, type UiLanguage } from './uiLanguage';
import {
  defaultPreferencesFromCatalog,
  parseStoredScripturePreferences,
  resolveInitialScriptureLanguage,
  type ScriptureLanguageOption,
  type ScripturePreferences,
  type ScriptureTranslation,
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

// App settings; stored in the meta table (key/value).
//
// Each prayer-content transfer has an independent versioned consent.
// A missing record and legacy permissive values never mean consent.

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
  // The saved schedule failed to parse and was replaced with the default one;
  // the flag stays until the first successful schedule write.
  reminderScheduleInvalid: boolean;
  prayerMinutes: number; // duration of the last started prayer; 0 = no timer
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
let scriptureInitializationPromise: Promise<ScriptureInitialization> | null = null;

export const useSettings = create<SettingsState>((set) => ({
  uiLanguage: initialUiLanguage(getLocales()),
  uiLanguageReady: false,
  coreAiConsent: 'undecided',
  answerContextConsent: 'undecided',
  audioTranscriptionConsent: 'undecided',
  scripturePreferences: null,
  reminderSchedule: DEFAULT_REMINDER_SCHEDULE,
  reminderScheduleInvalid: false,
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
        // Duration is published together with the language: the root layout
        // reveals screens after uiLanguageReady, so the first session reset on
        // Home already sees the stored value.
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
        // Normalize missing, malformed, and obsolete records right away, so
        // later reads do not depend on the legacy key or the app version.
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
        // A corrupted record does not count as a choice but does not vanish
        // silently: initialization replaces it with a confirmed triple and
        // leaves a trace in diagnostics.
        if (scriptureRow && !storedPreferences) {
          recordDiagnostic('scripture_preferences_invalid', { reason: 'malformed_scripture_preferences' });
        }
        const storedReminders = parseStoredReminderSchedule(remindersRow?.value ?? null);
        // A missing record is just the default schedule. A corrupted record is
        // replaced with it too, but the person sees a warning in Settings.
        const reminderScheduleInvalid = !!remindersRow && !storedReminders;
        if (reminderScheduleInvalid) {
          console.warn('Saved reminder schedule is unreadable');
          recordDiagnostic('reminder_schedule_invalid', { reason: 'malformed_reminder_schedule' });
        }
        set({
          coreAiConsent,
          answerContextConsent,
          audioTranscriptionConsent,
          scripturePreferences: storedPreferences,
          // The default schedule is static, so its absence needs no meta row:
          // one appears with the first user edit.
          reminderSchedule: storedReminders ?? DEFAULT_REMINDER_SCHEDULE,
          reminderScheduleInvalid,
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
    // Close the barrier in memory first: the revocation already applies to the
    // next request builder while SQLite is still completing the write.
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
      console.error('Failed to save a privacy decision', purpose, errorKind(error));
      recordDiagnostic('consent_save_failed', { purpose, errorKind: errorKind(error) });
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
    // The enabled flag, days, and times are one dependent value: a reader must
    // never see enabled reminders with a half-written schedule.
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('prayer_reminders', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(schedule),
    );
    set({ reminderSchedule: schedule, reminderScheduleInvalid: false });
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
 * Reset settings to a fresh-install state. Needed only for a full data wipe:
 * the database is deleted by that point, so memory must keep neither its
 * values nor the cached load promise — otherwise `load()` would decide the
 * settings are already loaded.
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
    reminderScheduleInvalid: false,
    prayerMinutes: DEFAULT_PRAYER_MINUTES,
    loaded: false,
  });
};

/** Current privacy barriers for non-React code, without a subscription. */
export const coreAiAllowedNow = () =>
  consentAllowsTransfer(useSettings.getState().coreAiConsent);

export const answerContextAllowedNow = () =>
  consentAllowsTransfer(useSettings.getState().answerContextConsent);

export const audioTranscriptionAllowedNow = () =>
  consentAllowsTransfer(useSettings.getState().audioTranscriptionConsent);

/** Privacy barrier for non-React code: persisted opt-out is loaded before networking. */
export const ensureSettingsLoaded = async () => {
  if (!useSettings.getState().loaded) await useSettings.getState().load();
};

/** The scripture catalog is unavailable: network, server response, or bad format. */
export class ScriptureCatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Scripture catalog unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'ScriptureCatalogUnavailableError';
  }
}

// Separate catalog failures from SQLite errors: the screen must name the real cause.
const fromCatalog = <T>(request: Promise<T>) =>
  request.catch((error: unknown) => {
    throw new ScriptureCatalogUnavailableError(error);
  });

/** The catalog is available but yields no complete triple for the interface language. */
export class ScriptureDefaultUnavailableError extends Error {
  constructor(message: string, readonly languages: ScriptureLanguageOption[]) {
    super(message);
    this.name = 'ScriptureDefaultUnavailableError';
  }
}

/**
 * Initialization result. Catalogs are returned only when they were the source
 * of the saved triple: the settings screen does not request them again.
 */
export type ScriptureInitialization = {
  preferences: ScripturePreferences;
  languages: ScriptureLanguageOption[] | null;
  translations: ScriptureTranslation[] | null;
};

type PersistOutcome = 'saved' | 'kept' | 'interface_language_changed';

// Persist the dependent triple serially: a late default must not overwrite an
// explicit choice made while the catalog was loading.
async function persistScripturePreferences(
  preferences: ScripturePreferences,
  initialLanguage?: UiLanguage,
): Promise<PersistOutcome> {
  let outcome: PersistOutcome = 'saved';
  scriptureSavePromise = scriptureSavePromise.catch(() => undefined).then(async () => {
    if (initialLanguage) {
      if (useSettings.getState().scripturePreferences) {
        outcome = 'kept';
        return;
      }
      if (useSettings.getState().uiLanguage !== initialLanguage) {
        outcome = 'interface_language_changed';
        return;
      }
    }
    const d = await getDb();
    await d.runAsync(
      `INSERT INTO meta (key, value) VALUES ('scripture_preferences', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(preferences),
    );
    useSettings.setState({ scripturePreferences: preferences });
  });
  await scriptureSavePromise;
  return outcome;
}

async function initializeScripturePreferences(): Promise<ScriptureInitialization> {
  // An interface-language change during loading is not an error: start over
  // with the new language; the old default is not saved.
  for (;;) {
    const interfaceLanguage = useSettings.getState().uiLanguage;
    const languages = await fromCatalog(fetchScriptureLanguages());
    const language = resolveInitialScriptureLanguage(interfaceLanguage, languages);
    // The interface language changed during loading: the "no Bible" verdict applied to the old one.
    if (useSettings.getState().uiLanguage !== interfaceLanguage) continue;
    if (!language) {
      throw new ScriptureDefaultUnavailableError('Scripture catalog does not contain the interface language', languages);
    }
    const translations = await fromCatalog(fetchScriptureTranslations(language.alias));
    const preferences = defaultPreferencesFromCatalog(language, translations);
    if (useSettings.getState().uiLanguage !== interfaceLanguage) continue;
    if (!preferences) {
      throw new ScriptureDefaultUnavailableError('Scripture catalog has no valid translation and voice', languages);
    }
    const outcome = await persistScripturePreferences(preferences, interfaceLanguage);
    if (outcome === 'interface_language_changed') continue;
    const saved = useSettings.getState().scripturePreferences;
    if (!saved) throw new Error('Scripture preferences were not saved');
    return { preferences: saved, languages, translations: outcome === 'saved' ? translations : null };
  }
}

/** Save no choice until the catalog confirms the language and a complete triple. */
export async function ensureScripturePreferences(): Promise<ScriptureInitialization> {
  await ensureSettingsLoaded();
  const saved = useSettings.getState().scripturePreferences;
  if (saved) return { preferences: saved, languages: null, translations: null };
  if (!scriptureInitializationPromise) {
    const pending = initializeScripturePreferences();
    scriptureInitializationPromise = pending;
    void pending.finally(() => {
      if (scriptureInitializationPromise === pending) scriptureInitializationPromise = null;
    }).catch(() => undefined);
  }
  return scriptureInitializationPromise;
}
