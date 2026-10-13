import type { UiLanguage } from './uiLanguage';

export const BIBLE_GARDEN_URL = 'https://bible.garden';

export function privacyPolicyUrl(language: UiLanguage): string {
  return `https://lampada.app/privacy?lang=${language}`;
}
