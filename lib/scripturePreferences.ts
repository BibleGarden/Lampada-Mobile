import type { ScriptureLanguage } from './scripture';

export type ScriptureVoice = {
  code: number;
  alias: string;
  name: string;
  description: string | null;
  isMusic: boolean;
};

export type ScriptureTranslation = {
  code: number;
  alias: string;
  name: string;
  description: string | null;
  language: ScriptureLanguage;
  voices: ScriptureVoice[];
};

export type ScriptureLanguageOption = {
  alias: ScriptureLanguage;
  nameEnglish: string;
  nameNational: string;
};

export type ScripturePreferences = {
  language: ScriptureLanguage;
  languageName: string;
  translationCode: number;
  translationAlias: string;
  translationName: string;
  voiceCode: number;
  voiceAlias: string;
  voiceName: string;
  voiceIsMusic: boolean;
};

/** Safe first-launch fallback when the device language cannot be confirmed. */
export const ENGLISH_SCRIPTURE_PREFERENCES: ScripturePreferences = {
  language: 'en',
  languageName: 'English',
  translationCode: 16,
  translationAlias: 'bsb',
  translationName: 'BSB',
  voiceCode: 151,
  voiceAlias: 'bsb_souer',
  voiceName: 'Bob Souer',
  voiceIsMusic: false,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCode = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isLanguage = (value: unknown): value is ScriptureLanguage =>
  typeof value === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(value);

export function parseStoredScripturePreferences(value: string | null): ScripturePreferences | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isObject(parsed) ||
      !isLanguage(parsed.language) ||
      typeof parsed.languageName !== 'string' ||
      !isCode(parsed.translationCode) ||
      typeof parsed.translationAlias !== 'string' ||
      typeof parsed.translationName !== 'string' ||
      !isCode(parsed.voiceCode) ||
      typeof parsed.voiceAlias !== 'string' ||
      typeof parsed.voiceName !== 'string' ||
      typeof parsed.voiceIsMusic !== 'boolean'
    ) return null;
    return parsed as ScripturePreferences;
  } catch {
    return null;
  }
}

const normalizeLanguage = (value: string | null | undefined) =>
  value?.trim().replaceAll('_', '-').toLowerCase() ?? '';

/** Resolve the primary device locale against aliases actually returned by the server. */
export function resolveInitialScriptureLanguage(
  deviceLocale: { languageTag?: string | null; languageCode?: string | null },
  languages: readonly ScriptureLanguageOption[],
): ScriptureLanguageOption | null {
  const tag = normalizeLanguage(deviceLocale.languageTag);
  const code = normalizeLanguage(deviceLocale.languageCode);
  const exactTag = languages.find((item) => normalizeLanguage(item.alias) === tag);
  if (exactTag) return exactTag;
  const exactCode = languages.find((item) => normalizeLanguage(item.alias) === code);
  if (exactCode) return exactCode;
  return languages.find((item) => normalizeLanguage(item.alias) === 'en') ?? null;
}

const preferredCodes: Readonly<Record<string, { translation: number; voice: number }>> = {
  ru: { translation: 1, voice: 1 },
  uk: { translation: 20, voice: 130 },
  en: { translation: 16, voice: 151 },
};

/** Pick a stable known pair when available, otherwise the first voiced server option. */
export function defaultPreferencesFromCatalog(
  language: ScriptureLanguageOption,
  translations: readonly ScriptureTranslation[],
): ScripturePreferences | null {
  const preferred = preferredCodes[normalizeLanguage(language.alias)];
  const preferredTranslation = preferred
    ? translations.find((item) => item.code === preferred.translation)
    : undefined;
  const preferredVoice = preferredTranslation?.voices.find((item) => item.code === preferred?.voice);
  if (preferredTranslation && preferredVoice) {
    return preferencesFromCatalog(language, preferredTranslation, preferredVoice);
  }
  const translation = translations.find(
    (item) => item.language === language.alias && item.voices.length > 0,
  );
  return translation
    ? preferencesFromCatalog(language, translation, translation.voices[0])
    : null;
}

export function preferencesFromCatalog(
  language: ScriptureLanguageOption,
  translation: ScriptureTranslation,
  voice: ScriptureVoice,
): ScripturePreferences | null {
  if (translation.language !== language.alias || !translation.voices.some((v) => v.code === voice.code)) {
    return null;
  }
  return {
    language: language.alias,
    languageName: language.nameNational,
    translationCode: translation.code,
    translationAlias: translation.alias,
    translationName: translation.name,
    voiceCode: voice.code,
    voiceAlias: voice.alias,
    voiceName: voice.name,
    voiceIsMusic: voice.isMusic,
  };
}
