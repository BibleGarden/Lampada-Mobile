import type { AnswerContext } from './answerContext';

export type QuestionMessage = { role: 'assistant' | 'user'; text: string };
export type QuestionRequest = {
  stage: 'first' | 'next' | 'reflect';
  topic: string;
  messages: QuestionMessage[];
  skipped_questions?: string[];
};

/** История только реальных ходов, без инструкций под видом реплик человека. */
export function buildQuestionRequest(
  stage: QuestionRequest['stage'],
  topic: string,
  questions: readonly string[] = [],
  answers: Record<number, AnswerContext> = {},
  skippedQuestions: readonly string[] = [],
): QuestionRequest {
  const messages: QuestionMessage[] = [];
  if (stage !== 'first') {
    for (let index = 0; index < questions.length; index++) {
      const answer = answers[index];
      if (!answer) continue;
      const text = [answer.text, ...answer.recordings.map((recording) => recording.transcript ?? '')]
        .map((part) => part.trim()).filter(Boolean).join('\n');
      if (!text) continue;
      const question = questions[index].trim();
      if (question) messages.push({ role: 'assistant', text: question });
      messages.push({ role: 'user', text });
    }
  }
  return limitQuestionRequest({ stage, topic: topic.trim(), messages,
    ...(stage !== 'first' && skippedQuestions.length ? { skipped_questions: [...skippedQuestions] } : {}),
  });
}

/** Старые сообщения отбрасываются целиком; последнюю реплику не обрезаем. */
export function limitQuestionRequest(request: QuestionRequest): QuestionRequest {
  let remaining = 16_000 - request.topic.length;
  if (remaining < 0) throw new Error('AI question topic exceeds the context limit');
  const messages: QuestionMessage[] = [];
  for (let index = request.messages.length - 1; index >= 0 && messages.length < 40; index--) {
    const message = request.messages[index];
    if (message.text.length > remaining) {
      if (!messages.length) throw new Error('AI latest reply exceeds the context limit');
      break;
    }
    messages.unshift({ ...message });
    remaining -= message.text.length;
  }
  // Ответы имеют приоритет по бюджету. Повторы исключаем до сокращения истории.
  const answered = new Set(request.messages.filter((m) => m.role === 'assistant').map((m) => m.text.trim()));
  const skipped: string[] = [];
  const candidates = request.stage === 'first' ? [] : (request.skipped_questions ?? [])
    .map((q) => q.trim()).filter((q) => q && !answered.has(q)).slice(-10);
  for (let index = candidates.length - 1; index >= 0; index--) {
    const question = candidates[index].slice(0, 300);
    if (question.length > remaining) break;
    if (answered.has(question)) continue;
    skipped.unshift(question);
    remaining -= question.length;
  }
  return { stage: request.stage, topic: request.topic, messages,
    ...(skipped.length ? { skipped_questions: skipped } : {}),
  };
}
