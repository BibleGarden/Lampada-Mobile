/** BCP-47-like alias returned by the Bible catalog (for example ru, en or uk). */
export type ScriptureLanguage = string;

export type ScriptureSource = 'rerank' | 'retrieval_fallback' | 'safe_pool';

export type ScriptureFallbackReason =
  | 'rerank_failed'
  | 'no_reranker'
  | 'deadline'
  | 'empty_topic'
  | 'ai_unavailable'
  | 'coverage_empty';

export type CanonicalPassage = {
  canonical_id: string;
  book_number: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number;
};

export type TranslatedPassage = {
  translation: number;
  translation_alias: string;
  book_number: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number;
  title: string | null;
  text: string;
  verses?: ScriptureVerse[];
};

export type ScriptureVerse = {
  number: number;
  text: string;
  paragraph_start: boolean;
};

export type ScriptureHighlight = {
  canonical: {
    book_number: number;
    chapter_number: number;
    verse_start: number;
    verse_end: number;
  };
  passage: {
    chapter_number: number;
    verse_start: number;
    verse_end: number;
  };
};

export type ScriptureSelection = {
  language: ScriptureLanguage;
  canonical: CanonicalPassage;
  passage: TranslatedPassage;
  highlight?: ScriptureHighlight;
  source: ScriptureSource | (string & {});
  fallback_reason?: ScriptureFallbackReason | null;
  history_reset: boolean;
};

export type ScriptureRequest = {
  language: ScriptureLanguage;
  topic?: string;
  user_replies?: string[];
  exclude_canonical_ids?: string[];
  translation?: number;
};

export type ScriptureDisplay = {
  canonicalId: string;
  reference: string;
  title: string | null;
  text: string;
  translationAlias: string;
  selection: ScriptureSelection;
  receivedAt: string;
  offline?: boolean;
};

export type FavoriteScripture = {
  id: string;
  canonicalId: string | null;
  reference: string;
  title: string | null;
  text: string;
  translationAlias: string | null;
  language: ScriptureLanguage | null;
  /** Полный ответ сервера: ключевые стихи и разбивка отрывка. NULL у legacy-записей. */
  selection: ScriptureSelection | null;
  createdAt: string;
  legacy?: unknown;
};

export const CANONICAL_ID_PATTERN = /^v\d{1,3}:\d{2}\.\d{3}\.\d{3}-\d{3}$/;

const limitCharacters = (value: string, limit: number) =>
  Array.from(value).slice(0, limit).join('');

export function buildScriptureRequest(input: {
  language: ScriptureLanguage;
  translation?: number;
  topic: string;
  replies: readonly string[];
  shareTopic: boolean;
  shareReplies: boolean;
  shownCanonicalIds: readonly string[];
}): ScriptureRequest {
  const request: ScriptureRequest = {
    language: input.language,
  };
  if (input.shareTopic) request.topic = limitCharacters(input.topic, 500);
  if (input.translation !== undefined) request.translation = input.translation;

  if (input.shareTopic && input.shareReplies) {
    const replies: string[] = [];
    let total = 0;
    for (const raw of input.replies) {
      if (replies.length >= 10) break;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const reply = limitCharacters(trimmed, Math.min(1000, 4000 - total));
      if (!reply) break;
      replies.push(reply);
      total += Array.from(reply).length;
      if (total >= 4000) break;
    }
    if (replies.length) request.user_replies = replies;
  }

  const validNewestFirst = [...input.shownCanonicalIds]
    .reverse()
    .filter((id) => CANONICAL_ID_PATTERN.test(id));
  const exclusions = [...new Set(validNewestFirst)].slice(0, 30);
  if (exclusions.length) request.exclude_canonical_ids = exclusions;
  return request;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isInteger = (value: unknown): value is number =>
  isNumber(value) && Number.isInteger(value);

const isScriptureVerse = (value: unknown): value is ScriptureVerse =>
  isObject(value) &&
  isInteger(value.number) &&
  typeof value.text === 'string' &&
  typeof value.paragraph_start === 'boolean';

const isScriptureHighlight = (value: unknown): value is ScriptureHighlight => {
  if (!isObject(value) || !isObject(value.canonical) || !isObject(value.passage)) {
    return false;
  }
  return (
    isInteger(value.canonical.book_number) &&
    isInteger(value.canonical.chapter_number) &&
    isInteger(value.canonical.verse_start) &&
    isInteger(value.canonical.verse_end) &&
    isInteger(value.passage.chapter_number) &&
    isInteger(value.passage.verse_start) &&
    isInteger(value.passage.verse_end)
  );
};

export function parseScriptureSelection(value: unknown): ScriptureSelection | null {
  if (!isObject(value) || !isObject(value.canonical) || !isObject(value.passage)) return null;
  const canonical = value.canonical;
  const passage = value.passage;
  if (
    typeof value.language !== 'string' ||
    !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(value.language) ||
    typeof canonical.canonical_id !== 'string' ||
    !CANONICAL_ID_PATTERN.test(canonical.canonical_id) ||
    !isNumber(canonical.book_number) ||
    !isNumber(canonical.chapter_number) ||
    !isNumber(canonical.verse_start) ||
    !isNumber(canonical.verse_end) ||
    !isNumber(passage.translation) ||
    typeof passage.translation_alias !== 'string' ||
    !isNumber(passage.book_number) ||
    !isNumber(passage.chapter_number) ||
    !isNumber(passage.verse_start) ||
    !isNumber(passage.verse_end) ||
    (passage.title !== null && typeof passage.title !== 'string') ||
    typeof passage.text !== 'string' ||
    (passage.verses !== undefined &&
      (!Array.isArray(passage.verses) ||
        passage.verses.length === 0 ||
        !passage.verses.every(isScriptureVerse))) ||
    (value.highlight !== undefined && !isScriptureHighlight(value.highlight)) ||
    typeof value.source !== 'string' ||
    typeof value.history_reset !== 'boolean'
  ) {
    return null;
  }
  return value as ScriptureSelection;
}

export type ScriptureTextSegment = {
  number: number;
  prefix: string;
  text: string;
  highlighted: boolean;
};

/**
 * Builds renderable verse spans only when they reconstruct passage.text exactly.
 * A malformed or older response therefore degrades to the unchanged plain text.
 */
export function buildScriptureTextSegments(
  selection: ScriptureSelection,
): ScriptureTextSegment[] | null {
  const verses = selection.passage.verses;
  if (!verses?.length) return null;

  const range = selection.highlight?.passage;
  const canHighlight = range?.chapter_number === selection.passage.chapter_number;
  const segments = verses.map((verse, index) => ({
    number: verse.number,
    prefix: index === 0 ? '' : verse.paragraph_start ? '\n\n' : ' ',
    text: verse.text,
    highlighted: !!canHighlight &&
      verse.number >= range!.verse_start &&
      verse.number <= range!.verse_end,
  }));

  return segments.map((segment) => segment.prefix + segment.text).join('') === selection.passage.text
    ? segments
    : null;
}

export type ScriptureCompactText = {
  text: string;
  highlightedNumbers: number[];
  /** True when the shown text is shorter than the whole passage. */
  partial: boolean;
};

/**
 * Text for the compact card: only the verses the server marked in
 * `highlight.passage`, and the whole passage when there is no such marking.
 */
export function buildScriptureCompactText(scripture: ScriptureDisplay): ScriptureCompactText {
  const segments = buildScriptureTextSegments(scripture.selection);
  const highlighted = segments?.filter((segment) => segment.highlighted) ?? [];
  const partial = !!segments && highlighted.length > 0 && highlighted.length < segments.length;

  return {
    text: partial ? highlighted.map((segment) => segment.text).join(' ') : scripture.text,
    highlightedNumbers: highlighted.map((segment) => segment.number),
    partial,
  };
}

export function formatScriptureReference(
  passage: TranslatedPassage,
  bookNames: Readonly<Record<number, string>>,
): string {
  const book = bookNames[passage.book_number] ?? `Книга ${passage.book_number}`;
  const verses = passage.verse_start === passage.verse_end
    ? `${passage.verse_start}`
    : `${passage.verse_start}–${passage.verse_end}`;
  return `${book} ${passage.chapter_number}:${verses}`;
}

export function toScriptureDisplay(
  selection: ScriptureSelection,
  bookNames: Readonly<Record<number, string>>,
  receivedAt = new Date().toISOString(),
): ScriptureDisplay {
  return {
    canonicalId: selection.canonical.canonical_id,
    reference: formatScriptureReference(selection.passage, bookNames),
    title: selection.passage.title,
    text: selection.passage.text,
    translationAlias: selection.passage.translation_alias,
    selection,
    receivedAt,
  };
}

/**
 * Восстанавливает отображаемый отрывок из сохранённой записи, чтобы избранное
 * рисовалось тем же компонентом, что и карточка во время молитвы. Возвращает
 * null для legacy-записей: у них нет ответа сервера, только плоский текст.
 */
export function favoriteToScriptureDisplay(
  favorite: FavoriteScripture,
): ScriptureDisplay | null {
  const selection = favorite.selection;
  if (!selection) return null;
  return {
    canonicalId: selection.canonical.canonical_id,
    reference: favorite.reference,
    title: selection.passage.title,
    text: selection.passage.text,
    translationAlias: selection.passage.translation_alias,
    selection,
    receivedAt: favorite.createdAt,
  };
}
