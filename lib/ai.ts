// AI-слой: вопросы Спутника, формулировка цели, вопрос рефлексии.
//
// Сетевая часть живёт в llm.ts; здесь — промпты и правило деградации:
// любая ошибка (прокси не настроен, сеть, таймаут, кривой ответ) тихо
// откатывает на курируемые пулы из прототипа. Молитва важнее генерации —
// экраны никогда не ждут ИИ дольше таймаута и никогда не видят ошибку.

import { complete, completeJson, llmConfigured } from './llm';

const PERSONA =
  'Ты — «Спутник» в приложении для личной христианской молитвы «Лампада». ' +
  'Твои вопросы помогают человеку молиться своими словами: честно, глубоко, без клише. ' +
  'Пиши по-русски, обращайся на «ты». Тон тёплый и тихий, без пафоса и без морализаторства. ' +
  'Вопросы короткие — одна строка, до 90 знаков, каждый заканчивается знаком вопроса.';

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

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// один вопрос — одна строка: нумерация и маркеры из модели вычищаются
const tidy = (q: string) =>
  q.replace(/^[\s\d.\-—)*]+/, '').replace(/\s+/g, ' ').trim();

const isQuestion = (q: unknown): q is string =>
  typeof q === 'string' && q.trim().length >= 8 && q.trim().length <= 140 && q.includes('?');

/** 5 наводящих вопросов по теме молитвы */
export async function generateQuestions(topic: string): Promise<string[]> {
  if (!llmConfigured() || !topic.trim()) return curatedQuestions;
  try {
    const qs = await completeJson<string[]>(
      PERSONA,
      `Человек начинает молитву. Его цель: «${topic.trim()}».\n` +
        'Составь ровно 5 наводящих вопросов для этой молитвы. Иди от поверхности вглубь: ' +
        'первый — про то, что происходит и что он чувствует, последние — про доверие Богу и следующий шаг. ' +
        'Не пересказывай цель дословно в каждом вопросе.\n' +
        'Ответь строго JSON-массивом из 5 строк, без пояснений.',
    );
    const clean = Array.isArray(qs) ? qs.filter(isQuestion).map(tidy) : [];
    return clean.length === 5 ? clean : curatedQuestions;
  } catch {
    return curatedQuestions;
  }
}

/**
 * Один новый вопрос, не повторяющий уже заданные.
 * answers передаются только если человек разрешил это в настройках
 * («Учитывать мои ответы») — иначе вызывающий обязан передать [].
 */
export async function generateQuestion(
  topic: string,
  asked: string[],
  answers: string[] = [],
): Promise<string> {
  const fallback = () => {
    const used = new Set(asked);
    const fresh = questionPool.filter((q) => !used.has(q));
    return pickRandom(fresh.length ? fresh : questionPool);
  };
  if (!llmConfigured()) return fallback();
  try {
    const q = await complete(
      PERSONA,
      (topic.trim() ? `Цель молитвы: «${topic.trim()}».\n` : 'Молитва без конкретной темы.\n') +
        `Уже прозвучали вопросы:\n${asked.map((a) => `— ${a}`).join('\n')}\n` +
        (answers.length
          ? `Что человек ответил (опирайся на это, но не цитируй дословно):\n${answers.map((a) => `— ${a}`).join('\n')}\n`
          : '') +
        'Задай один новый вопрос, который смотрит на ситуацию с другой стороны и не повторяет прозвучавшие. ' +
        'Ответь только текстом вопроса, без кавычек и пояснений.',
    );
    const clean = tidy(q);
    return isQuestion(clean) ? clean : fallback();
  } catch {
    return fallback();
  }
}

/** Придаточное для фразы «у тебя N минут, чтобы …»; null — показать цель как есть */
export async function rephraseGoal(topic: string): Promise<string | null> {
  if (!llmConfigured() || !topic.trim()) return null;
  try {
    const p = await complete(
      PERSONA,
      `Человек сформулировал цель молитвы: «${topic.trim()}».\n` +
        'Преврати её в короткое придаточное для фразы «У тебя есть десять минут, чтобы …». ' +
        'Начни с глагола в инфинитиве, до 60 знаков, без точки в конце. ' +
        'Пример: цель «поговорить про ссору с мамой» → «побыть с Богом в том, что случилось с мамой». ' +
        'Ответь только придаточным.',
    );
    const clean = p.replace(/^["«]|[»".]+$/g, '').trim();
    return clean && clean.length <= 90 ? clean : null;
  } catch {
    return null;
  }
}

/** Вопрос рефлексии по цели и ответам сессии */
export async function generateReflectQuestion(
  topic: string,
  answers: string[],
): Promise<string> {
  if (!llmConfigured()) return pickRandom(reflectPool);
  try {
    const q = await complete(
      PERSONA,
      'Молитва закончилась, человек готов записать один вывод.\n' +
        (topic.trim() ? `Цель была: «${topic.trim()}».\n` : '') +
        (answers.length
          ? `Его ответы во время молитвы:\n${answers.map((a) => `— ${a}`).join('\n')}\n`
          : 'Он молился молча, письменных ответов нет.\n') +
        'Задай один тёплый итоговый вопрос, который поможет ему назвать главное из этой молитвы. ' +
        'Не цитируй его ответы дословно. Ответь только текстом вопроса.',
    );
    const clean = tidy(q);
    return isQuestion(clean) ? clean : pickRandom(reflectPool);
  } catch {
    return pickRandom(reflectPool);
  }
}
