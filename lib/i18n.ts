import { useCallback } from 'react';
import { useSettings } from './settings';
import { securityComponentMessages } from './locales/securityComponents';
import { answerComponentMessages } from './locales/answerComponents';
import { componentMessages } from './locales/components';
import { screenMessages } from './locales/screens';
import { settingMessages } from './locales/settings';
import { systemMessages } from './locales/system';
import type { UiLanguage } from './uiLanguage';
export { localeTag, pluralCategory } from './uiLanguage';
export type { UiLanguage } from './uiLanguage';

type Parameters = Record<string, string | number>;
const messages: Record<UiLanguage, Record<string, string>> = {
  en: { ...securityComponentMessages.en, ...answerComponentMessages.en, ...componentMessages.en, ...screenMessages.en, ...settingMessages.en, ...systemMessages.en },
  ru: { ...securityComponentMessages.ru, ...answerComponentMessages.ru, ...componentMessages.ru, ...screenMessages.ru, ...settingMessages.ru, ...systemMessages.ru },
  uk: { ...securityComponentMessages.uk, ...answerComponentMessages.uk, ...componentMessages.uk, ...screenMessages.uk, ...settingMessages.uk, ...systemMessages.uk },
};

export function translateFor(language: UiLanguage, key: string, params: Parameters = {}): string {
  const message = messages[language][key] ?? messages.en[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder);
}

export const translate = (key: string, params?: Parameters): string =>
  translateFor(useSettings.getState().uiLanguage, key, params);

export function useI18n() {
  const language = useSettings((state) => state.uiLanguage);
  const t = useCallback((key: string, params?: Parameters) => translateFor(language, key, params), [language]);
  return { language, t };
}
