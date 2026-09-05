export type UiLanguage = 'en' | 'ru' | 'uk';

export const isUiLanguage = (value: unknown): value is UiLanguage =>
  value === 'en' || value === 'ru' || value === 'uk';

export function initialUiLanguage(locales: readonly { languageCode: string | null }[]): UiLanguage {
  const language = locales.find((locale) => isUiLanguage(locale.languageCode))?.languageCode;
  return isUiLanguage(language) ? language : 'en';
}

export const localeTag = (language: UiLanguage): string =>
  ({ en: 'en-US', ru: 'ru-RU', uk: 'uk-UA' })[language];

/** Формы количественных числительных для трёх языков, без Intl.PluralRules. */
export function pluralCategory(language: UiLanguage, value: number): 'one' | 'few' | 'many' | 'other' {
  const count = Math.abs(value);
  if (language === 'en') return count === 1 ? 'one' : 'other';
  if (!Number.isInteger(count)) return 'other';
  const last = count % 10;
  const lastTwo = count % 100;
  if (last === 1 && lastTwo !== 11) return 'one';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'few';
  return 'many';
}
