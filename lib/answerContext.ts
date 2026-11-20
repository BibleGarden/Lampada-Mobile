// What parts of a person's answer may go into the AI context.
//
// An answer is more than typed text: as far as the model is concerned, a
// voice recording exists only as its transcript. The audio itself never
// enters a prompt — neither for questions nor for scripture selection.
//
// The module is pure: the answer-context privacy gate is applied by the
// caller before building the request and again before the network call.

export type AnswerContext = {
  text: string;
  recordings: readonly { transcript: string | null }[];
};

/**
 * The person's replies in conversation order: by ascending question index,
 * and within an answer its text first, then the transcripts of its
 * recordings. Empty replies (no text, a recording without a transcript)
 * are dropped.
 */
export function replyTexts(answers: Record<number, AnswerContext>): string[] {
  return Object.keys(answers)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const answer = answers[index];
      return [answer.text, ...answer.recordings.map((r) => r.transcript ?? '')];
    })
    .map((reply) => reply.trim())
    .filter(Boolean);
}
