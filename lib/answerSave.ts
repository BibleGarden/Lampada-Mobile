import { consentAllowsTransfer, type ConsentDecision } from './privacyConsent.ts';

/** manual — кнопка «Сохранить»; auto — дописывание черновика перед размышлением. */
export type AnswerSaveMode = 'manual' | 'auto';

type AnswerSave = {
  mode: AnswerSaveMode;
  /** Есть текст или готовая расшифровка, которые могли бы уйти в запрос. */
  hasAnswerContext: boolean;
  coreAiConsent: ConsentDecision;
  answerContextConsent: ConsentDecision;
};

/**
 * Ответ сохраняется локально всегда: согласие answer_context управляет только
 * передачей на сервер. Раскрытие показывается после сохранения и только при
 * ручном сохранении — автосохранение не блокирует переход к размышлению, а
 * нерешённое согласие спросится при следующем ручном сохранении.
 */
export function saveAnswerDraft(
  { mode, hasAnswerContext, coreAiConsent, answerContextConsent }: AnswerSave,
  persist: () => void,
  askAnswerConsent: () => void,
) {
  persist();
  if (
    mode === 'manual' &&
    hasAnswerContext &&
    consentAllowsTransfer(coreAiConsent) &&
    answerContextConsent === 'undecided'
  ) {
    askAnswerConsent();
  }
}
