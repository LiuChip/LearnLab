import { describe, expect, it } from 'vitest';
import { shouldPreserveWorkspaceSearch } from '../apps/desktop/src/renderer/stores/readingStore';

describe('reading store search scope', () => {
  it('preserves completed search results while navigation stays in the same workspace', () => {
    expect(shouldPreserveWorkspaceSearch('/workspace')).toBe(true);
  });

  it('clears package-local search results when another package loads', () => {
    expect(shouldPreserveWorkspaceSearch(null)).toBe(false);
  });
});
