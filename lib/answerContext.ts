// Что из ответа человека может уйти в ИИ-контекст.
//
// Ответ — это не только набранный текст: голосовая запись для модели
// существует ровно своей расшифровкой. Само аудио в промпт не попадает
// никогда — ни в вопросы, ни в подбор Писания.
//
// Модуль чистый: privacy gate для answer context применяется вызывающим
// перед сборкой запроса и повторно перед сетевым вызовом.

export type AnswerContext = {
  text: string;
  recordings: readonly { transcript: string | null }[];
};

/**
 * Реплики человека в порядке разговора: по возрастанию индекса вопроса,
 * внутри ответа — сначала текст, затем расшифровки его записей.
 * Пустые реплики (нет текста, запись без расшифровки) отбрасываются.
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
