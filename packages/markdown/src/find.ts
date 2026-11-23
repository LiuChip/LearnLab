// Node-free text finder shared by the reader's current-file find. It mirrors the
// semantics of the core workspace search (case, whole word, regex) but works on
// plain text and returns offset ranges, so the renderer can highlight them.

export interface FindOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  isRegex?: boolean;
}

export interface FindRange {
  start: number;
  end: number;
}

export interface FindResult {
  ranges: FindRange[];
  error?: string;
}

const MAX_REGEX_LENGTH = 300;
const MAX_MATCHES = 5000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasCatastrophicBacktracking(pattern: string): boolean {
  return /(?<!\\)\((?:[^)\\]|\\.)*[+*](?<!\\)\)(?:[+*]|\{\d+,?\d*\})|(?<!\\)\[(?:[^\]\\]|\\.)*\][+*]{2,}/.test(pattern);
}

export function compileFindPattern(options: FindOptions): { regex?: RegExp; error?: string } {
  if (!options.query) return { error: '查找内容不能为空' };
  let pattern = options.query;
  if (options.isRegex) {
    if (pattern.length > MAX_REGEX_LENGTH) return { error: `正则表达式过长（最多 ${MAX_REGEX_LENGTH} 个字符）` };
    if (hasCatastrophicBacktracking(pattern)) return { error: '正则表达式包含可能导致卡死的嵌套量词' };
  } else {
    pattern = escapeRegex(pattern);
  }
  if (options.wholeWord) pattern = `\\b(?:${pattern})\\b`;
  try {
    return { regex: new RegExp(pattern, options.caseSensitive ? 'g' : 'gi') };
  } catch (cause) {
    return { error: `正则表达式无效：${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

/** Finds every non-empty match in `text`. An empty query yields no ranges and no error. */
export function findInText(text: string, options: FindOptions): FindResult {
  if (!options.query.trim()) return { ranges: [] };
  const { regex, error } = compileFindPattern(options);
  if (error || !regex) return { ranges: [], error };
  const ranges: FindRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (ranges.length >= MAX_MATCHES) break;
  }
  return { ranges };
}

/** Moves the active match index forward or backward, wrapping around. -1 means none. */
export function stepMatchIndex(current: number, total: number, direction: 'next' | 'previous'): number {
  if (total <= 0) return -1;
  if (current < 0 || current >= total) return direction === 'next' ? 0 : total - 1;
  return (current + (direction === 'next' ? 1 : -1) + total) % total;
}
