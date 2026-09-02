import { describe, expect, it } from 'vitest';
import { isValidChapterPath, normalizeSafePath } from '../packages/core/src/package-paths';

describe('Package Paths', () => {
  it('allows safe chapter paths', () => {
    expect(isValidChapterPath('/pkg', '01-intro.md')).toBe(true);
    expect(isValidChapterPath('/pkg', 'foo/bar.md')).toBe(true);
  });

  it('rejects path traversal', () => {
    expect(isValidChapterPath('/pkg', '../secret.md')).toBe(false);
    expect(isValidChapterPath('/pkg', '../../../../etc/passwd')).toBe(false);
    expect(isValidChapterPath('/pkg', '../chapters-evil/secret.md')).toBe(false);
    expect(isValidChapterPath('/pkg', 'foo/../../chapters-evil/secret.md')).toBe(false);
  });

  it('rejects absolute paths and the base directory itself', () => {
    expect(isValidChapterPath('/pkg', '/etc/passwd')).toBe(false);
    expect(normalizeSafePath('/pkg/chapters', '')).toBeNull();
  });

  it('returns a normalized path only when the candidate stays inside the base', () => {
    expect(normalizeSafePath('/pkg/chapters', 'foo/../01-intro.md')).toBe('/pkg/chapters/01-intro.md');
    expect(normalizeSafePath('/pkg/chapters', '../chapters-evil/secret.md')).toBeNull();
  });
});
