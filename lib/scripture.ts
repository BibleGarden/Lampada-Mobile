export type ScriptureLanguage = 'ru' | 'en' | 'uk';

export type ScriptureSource = 'rerank' | 'retrieval_fallback' | 'safe_pool';

export type ScriptureFallbackReason =
  | 'rerank_failed'
  | 'no_reranker'
  | 'deadline'
  | 'empty_topic'
  | 'ai_unavailable';

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
};

export type ScriptureSelection = {
  language: ScriptureLanguage;
  canonical: CanonicalPassage;
  passage: TranslatedPassage;
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
  shareReplies: boolean;
  shownCanonicalIds: readonly string[];
}): ScriptureRequest {
  const request: ScriptureRequest = {
    language: input.language,
    topic: limitCharacters(input.topic, 500),
  };
  if (input.translation !== undefined) request.translation = input.translation;

  if (input.shareReplies) {
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

export function parseScriptureSelection(value: unknown): ScriptureSelection | null {
  if (!isObject(value) || !isObject(value.canonical) || !isObject(value.passage)) return null;
  const canonical = value.canonical;
  const passage = value.passage;
  if (
    (value.language !== 'ru' && value.language !== 'en' && value.language !== 'uk') ||
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
    typeof value.source !== 'string' ||
    typeof value.history_reset !== 'boolean'
  ) {
    return null;
  }
  return value as ScriptureSelection;
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
