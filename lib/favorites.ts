/** Преобразует сохранённые ссылки Писания в индексы текущего каталога. */
export function favoriteIndexesFromRefs(
  refs: Iterable<string>,
  catalog: readonly { ref: string }[],
): number[] {
  const favoriteRefs = new Set(refs);
  return catalog.flatMap((scripture, index) => (favoriteRefs.has(scripture.ref) ? [index] : []));
}
