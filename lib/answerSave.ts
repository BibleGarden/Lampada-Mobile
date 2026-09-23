import { consentAllowsTransfer, type ConsentDecision } from './privacyConsent.ts';

/** manual — кнопка «Сохранить»; auto — дописывание черновика перед размышлением. */
export type AnswerSaveMode = 'manual' | 'auto';

type AnswerSave = {
  mode: AnswerSaveMode;
  /** Есть текст или готовая расшифровка, которые могли бы уйти в запрос. */
  hasAnswerContext: boolean;
  coreAiConsent: ConsentDecision;
  answerContextConsent: ConsentDecision;
  /** Время молитвы вышло: экран сессии вот-вот сменится размышлением. */
  prayerEnded: boolean;
};

/**
 * Ответ сохраняется локально всегда: согласие answer_context управляет только
 * передачей на сервер. Раскрытие показывается после успешной записи в БД и
 * только при ручном сохранении, пока молитва идёт: автосохранение не блокирует
 * переход к размышлению, а после конца времени экран сессии размонтируется
 * вместе с окном. Нерешённое согласие спросится при следующем ручном сохранении.
 * Ошибка записи пробрасывается, и согласие тогда не спрашивается.
 */
export async function saveAnswerDraft(
  { mode, hasAnswerContext, coreAiConsent, answerContextConsent, prayerEnded }: AnswerSave,
  persist: () => Promise<void>,
  askAnswerConsent: () => void,
) {
  await persist();
  if (
    mode === 'manual' &&
    !prayerEnded &&
    hasAnswerContext &&
    consentAllowsTransfer(coreAiConsent) &&
    answerContextConsent === 'undecided'
  ) {
    askAnswerConsent();
  }
}

/**
 * Одно сохранение ответа за раз. Повторный вызов во время записи не начинает
 * вторую, а ждёт текущую: автосохранение перед размышлением не должно уйти
 * со страницы раньше, чем закончится уже начатое ручное сохранение.
 */
export function createAnswerSaveFlight() {
  let active: Promise<void> | null = null;
  return {
    run(save: () => Promise<void>): Promise<void> {
      if (active) return active;
      const current = save().finally(() => {
        active = null;
      });
      active = current;
      return current;
    },
    isActive: () => active !== null,
  };
}
