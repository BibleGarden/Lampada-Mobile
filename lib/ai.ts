// AI-слой. Сейчас — моки с курируемыми пулами из прототипа.
// Интерфейс совпадает с будущим прокси (Cloudflare Worker): подмена не тронет экраны.

const MOCK_DELAY_MS = 700;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const curatedQuestions: string[] = [
  'Что на самом деле тревожит тебя сейчас больше всего?',
  'Чего ты по-настоящему хочешь в этой ситуации?',
  'Чего ты боишься потерять?',
  'Что тебе подсказывает совесть, когда ты затихаешь?',
  'Если бы Бог сейчас был рядом и слушал — что бы ты Ему сказал?',
];

const questionPool: string[] = [
  'Что изменится в тебе, если ты доверишь это Богу?',
  'За что ты можешь поблагодарить даже сейчас?',
  'Кому, кроме тебя, важен исход этой ситуации?',
  'Что ты держишь в руках слишком крепко?',
  'Какой первый честный шаг ты можешь сделать?',
  'Где в этом ты ищешь своей воли, а где — Его?',
  'Что бы ты сказал другу в такой же ситуации?',
  'Чего ты пока не решаешься сказать вслух?',
];

const reflectPool: string[] = [
  'Стало ли тебе яснее, о чём ты на самом деле просил?',
  'Почувствовал ли ты, что продвинулся к тому, ради чего молился?',
  'Что из этой молитвы тебе хочется унести с собой?',
];

/** 5 наводящих вопросов по теме молитвы */
export async function generateQuestions(topic: string): Promise<string[]> {
  await delay(MOCK_DELAY_MS);
  return curatedQuestions;
}

/** Один новый вопрос, не повторяющий уже заданные */
export async function generateQuestion(topic: string, asked: string[]): Promise<string> {
  await delay(MOCK_DELAY_MS);
  const used = new Set(asked);
  const fresh = questionPool.filter((q) => !used.has(q));
  const arr = fresh.length ? fresh : questionPool;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Придаточное для фразы «у тебя N минут, чтобы …» */
export async function rephraseGoal(topic: string): Promise<string | null> {
  await delay(300);
  return null; // мок: экран покажет исходную формулировку цели
}

/** Вопрос рефлексии по цели и ответам */
export async function generateReflectQuestion(
  topic: string,
  answers: string[],
): Promise<string> {
  await delay(MOCK_DELAY_MS);
  return reflectPool[Math.floor(Math.random() * reflectPool.length)];
}
