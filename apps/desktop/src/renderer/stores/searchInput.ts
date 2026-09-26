export function getSearchInputEffect(query: string): { type: 'clear' | 'search' } {
  return { type: query.trim() ? 'search' : 'clear' };
}

export function scheduleLiveSearch(
  query: string,
  search: (query: string) => void,
  delayMs = 250
): () => void {
  if (getSearchInputEffect(query).type === 'clear') return () => {};
  const timer = setTimeout(() => search(query), delayMs);
  return () => clearTimeout(timer);
}
