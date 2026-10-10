import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { getDb, recordDiagnostic } from './db';
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
let scriptureInitializationPromise: Promise<ScriptureInitialization> | null = null;

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
        // Повреждённая запись не считается выбором, но и не исчезает молча:
        // инициализация заменит её подтверждённой тройкой, а след останется в диагностике.
        if (scriptureRow && !storedPreferences) {
          recordDiagnostic('scripture_preferences_invalid', new Error('Malformed meta.scripture_preferences'));
        }
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

/** Privacy barrier for non-React code: persisted opt-out is loaded before networking. */
export const ensureSettingsLoaded = async () => {
  if (!useSettings.getState().loaded) await useSettings.getState().load();
};

/** Каталог Библии недоступен: сеть, ответ сервера или неверный формат. */
export class ScriptureCatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Scripture catalog unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'ScriptureCatalogUnavailableError';
  }
}

// Отделяем сбой каталога от ошибок SQLite: экран должен назвать настоящую причину.
const fromCatalog = <T>(request: Promise<T>) =>
  request.catch((error: unknown) => {
    throw new ScriptureCatalogUnavailableError(error);
  });

/** Каталог доступен, но не даёт полной тройки для языка интерфейса. */
export class ScriptureDefaultUnavailableError extends Error {
  constructor(message: string, readonly languages: ScriptureLanguageOption[]) {
    super(message);
    this.name = 'ScriptureDefaultUnavailableError';
  }
}

/**
 * Результат инициализации. Каталоги возвращаются, только если именно они дали
 * сохранённую тройку: экран настроек не запрашивает их повторно.
 */
export type ScriptureInitialization = {
  preferences: ScripturePreferences;
  languages: ScriptureLanguageOption[] | null;
  translations: ScriptureTranslation[] | null;
};

type PersistOutcome = 'saved' | 'kept' | 'interface_language_changed';

// Сохраняем зависимую тройку последовательно: поздний дефолт не должен
// перезаписать явный выбор, сделанный человеком во время загрузки каталога.
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
  // Смена языка интерфейса во время загрузки — не ошибка: начинаем заново уже
  // для нового языка, старый дефолт не сохраняется.
  for (;;) {
    const interfaceLanguage = useSettings.getState().uiLanguage;
    const languages = await fromCatalog(fetchScriptureLanguages());
    const language = resolveInitialScriptureLanguage(interfaceLanguage, languages);
    // Язык интерфейса сменился во время загрузки: вывод «нет Библии» относился к старому.
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

/** Не сохраняем никакого выбора до подтверждения языка и полной тройки каталогом. */
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
