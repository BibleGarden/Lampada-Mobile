import type { JournalDetail, JournalEntry } from './db';
import type { FavoriteScripture } from './scripture';

// Текстовый экспорт молитвы из дневника: только то, что человек может
// прочитать. Аудиофайлы никогда не покидают устройство — уходят лишь
// расшифровки, которые пользователь уже видит в дневнике.
//
// Текст читают в заметках и мессенджерах, где нет разметки, поэтому
// структуру держат явные подписи («Тема:», «Вопрос 1:», «Ответ:») и
// разделители из трёх длинных тире между смысловыми частями.

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Поля дневниковой карточки, которых достаточно для экспорта. */
export type PrayerExportEntry = Pick<
  JournalEntry,
  'topic' | 'startedAt' | 'elapsedSec' | 'takeaway'
>;

type Recording = JournalDetail['recordings'][number];

export const DEFAULT_APP_NAME = 'Lampada';

const SEPARATOR = '———';

/** Заголовок молитвы: цель, а если её нет — нейтральное «Молитва». */
export const prayerExportTitle = (entry: PrayerExportEntry, t: Translate): string =>
  entry.topic.trim() || t('screens.journal.exportPrayer');

// Дата и время начала в языке интерфейса; битую строку просто опускаем.
function formatStartedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

// Длительность считаем ровно так же, как карточка дневника.
function formatDuration(seconds: number, t: Translate): string {
  if (!(seconds > 0)) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t('screens.journal.lessMinute');
  return minutes < 60
    ? t('screens.duration.minutes', { count: minutes })
    : t('screens.duration.hoursMinutes', {
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60,
      });
}

// Расшифровки записей одного вопроса. Записи без текста пропускаем:
// в экспорте от них остался бы пустой заголовок.
function transcriptLines(
  recordings: readonly Recording[],
  questionIndex: number,
  t: Translate,
): string[] {
  return recordings
    .filter((r) => r.questionIndex === questionIndex)
    .map((r) => r.transcript?.trim() ?? '')
    .filter((transcript) => transcript.length > 0)
    .map((transcript) => `${t('screens.journal.exportVoiceNote')}: ${transcript}`);
}

// «Вопрос N» с текстом вопроса, если он сохранился.
function questionHeading(position: number, question: string, t: Translate): string {
  const label = t('screens.journal.exportQuestion', { count: position });
  return question ? `${label}: ${question}` : label;
}

/**
 * Собирает читаемый текст молитвы для системного «Поделиться».
 * Чистая функция: ни базы, ни сети, ни нативных модулей.
 */
export function buildPrayerExportText(
  entry: PrayerExportEntry,
  detail: JournalDetail | null,
  favorites: readonly FavoriteScripture[],
  t: Translate,
  locale: string,
  appName: string = DEFAULT_APP_NAME,
): string {
  // Шапка: тема есть всегда, дата и длительность — если их удалось собрать.
  const metaLines = [`${t('screens.journal.exportTopic')}: ${prayerExportTitle(entry, t)}`];
  const startedAt = formatStartedAt(entry.startedAt, locale);
  if (startedAt) metaLines.push(`${t('screens.journal.exportDate')}: ${startedAt}`);
  const duration = formatDuration(entry.elapsedSec, t);
  if (duration) metaLines.push(`${t('screens.journal.exportDuration')}: ${duration}`);

  const recordings = detail?.recordings ?? [];
  const answers = [...(detail?.answers ?? [])].sort((a, b) => a.questionIndex - b.questionIndex);

  // Нумерация — по порядку показа, а не по questionIndex: пропуски в индексах
  // не должны оставлять дыр в «Вопрос N».
  const answerBlocks: string[] = [];
  for (const answer of answers) {
    const lines = [questionHeading(answerBlocks.length + 1, answer.question.trim(), t)];
    const text = answer.text.trim();
    if (text) lines.push(`${t('screens.journal.exportAnswer')}: ${text}`);
    lines.push(...transcriptLines(recordings, answer.questionIndex, t));
    answerBlocks.push(lines.join('\n'));
  }

  // Записи, у которых нет своего ответа, идут хвостом — как в карточке дневника.
  const answered = new Set(answers.map((a) => a.questionIndex));
  const orphanIndexes = [
    ...new Set(recordings.filter((r) => !answered.has(r.questionIndex)).map((r) => r.questionIndex)),
  ].sort((a, b) => a - b);
  for (const questionIndex of orphanIndexes) {
    const transcripts = transcriptLines(recordings, questionIndex, t);
    if (transcripts.length === 0) continue;
    answerBlocks.push([questionHeading(answerBlocks.length + 1, '', t), ...transcripts].join('\n'));
  }

  // Цитаты и итог — один смысловой раздел, поэтому и разделитель у них общий.
  const closingBlocks: string[] = [];
  const quotes = favorites
    .map((favorite) => {
      const reference = favorite.reference.trim();
      const text = favorite.text.trim();
      if (!reference && !text) return '';
      return reference && text ? `${reference} — ${text}` : reference || text;
    })
    .filter((line) => line.length > 0)
    .map((line) => `• ${line}`);
  if (quotes.length > 0) {
    closingBlocks.push([`${t('screens.favorites.title')}:`, ...quotes].join('\n'));
  }

  const takeaway = entry.takeaway.trim();
  if (takeaway) closingBlocks.push(`${t('screens.journal.exportTakeaway')}:\n${takeaway}`);

  // Пустые разделы выпадают вместе со своими разделителями.
  const sections = [[metaLines.join('\n')], answerBlocks, closingBlocks]
    .filter((blocks) => blocks.length > 0)
    .map((blocks) => blocks.join('\n\n'));

  return `${sections.join(`\n\n${SEPARATOR}\n\n`)}\n\n${SEPARATOR}\n${appName}`;
}
