import { consentAllowsTransfer, type ConsentDecision } from './privacyConsent.ts';

/** manual — the "Save" button; auto — appending the draft before reflection. */
export type AnswerSaveMode = 'manual' | 'auto';

type AnswerSave = {
  mode: AnswerSaveMode;
  /** There is text or a finished transcript that could go into the request. */
  hasAnswerContext: boolean;
  coreAiConsent: ConsentDecision;
  answerContextConsent: ConsentDecision;
  /** Prayer time is over: the session screen is about to give way to reflection. */
  prayerEnded: boolean;
};

/**
 * The answer is always saved locally: answer_context consent only governs
 * the transfer to the server. The disclosure is shown after a successful DB
 * write, and only for a manual save while the prayer is still running:
 * autosaving must not block the transition to reflection, and after time
 * runs out the session screen unmounts together with the dialog. An
 * undecided consent is asked again at the next manual save. A write error
 * is rethrown, and consent is not asked then.
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
 * One answer save at a time. A repeated call during a save does not start a
 * second one but awaits the current: the autosave before reflection must
 * not leave the page before an already started manual save finishes.
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
