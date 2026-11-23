import { describe, expect, it } from 'vitest';
import { findInText, stepMatchIndex } from '../packages/markdown/src/find';

describe('findInText', () => {
  const text = 'SELECT * FROM users; select id From accounts; Selected';

  it('is case-insensitive by default and honours case-sensitive', () => {
    expect(findInText(text, { query: 'select' }).ranges).toHaveLength(3);
    expect(findInText(text, { query: 'select', caseSensitive: true }).ranges).toEqual([{ start: 21, end: 27 }]);
  });

  it('supports whole-word matching', () => {
    expect(findInText('cat catch cats cat.', { query: 'cat', wholeWord: true }).ranges).toHaveLength(2);
  });

  it('supports regular expressions', () => {
    const result = findInText('a1 b22 c333', { query: '\\d+', isRegex: true });
    expect(result.ranges.map((r) => text.length && r.end - r.start)).toEqual([1, 2, 3]);
  });

  it('returns nothing and no error for an empty or blank query', () => {
    expect(findInText(text, { query: '' })).toEqual({ ranges: [] });
    expect(findInText(text, { query: '   ' })).toEqual({ ranges: [] });
  });

  it('reports invalid, overlong and risky regular expressions instead of throwing', () => {
    expect(findInText(text, { query: '(', isRegex: true }).error).toBeTruthy();
    expect(findInText(text, { query: 'a'.repeat(301), isRegex: true }).error).toBeTruthy();
    expect(findInText(text, { query: '(a+)+', isRegex: true }).error).toBeTruthy();
  });

  it('skips zero-length matches without looping forever', () => {
    expect(findInText('abc', { query: 'x*', isRegex: true }).ranges).toEqual([]);
  });
});

describe('stepMatchIndex', () => {
  it('wraps around in both directions', () => {
    expect(stepMatchIndex(2, 3, 'next')).toBe(0);
    expect(stepMatchIndex(0, 3, 'previous')).toBe(2);
    expect(stepMatchIndex(1, 3, 'next')).toBe(2);
  });

  it('starts at the first or last match when nothing is active, and is -1 without matches', () => {
    expect(stepMatchIndex(-1, 4, 'next')).toBe(0);
    expect(stepMatchIndex(-1, 4, 'previous')).toBe(3);
    expect(stepMatchIndex(0, 0, 'next')).toBe(-1);
  });
});
