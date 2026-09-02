import { describe, it, expect } from 'vitest';
import { validateManifest } from '../packages/core-types/src/validator';

describe('Manifest Validator', () => {
  it('should validate a correct manifest', () => {
    const valid = {
      id: 'test-pkg',
      version: '1.0.0',
      name: 'Test',
      author: 'Author',
      chapters: [
        { id: '1', title: 'Chapter 1', file: 'ch1.md' }
      ]
    };
    const result = validateManifest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('test-pkg');
    }
  });

  it('should fail if missing required fields', () => {
    const invalid = {
      version: '1.0.0',
      name: 'Test',
      chapters: []
    };
    const result = validateManifest(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContainEqual(expect.objectContaining({ path: 'id' }));
      expect(result.error).toContainEqual(expect.objectContaining({ path: 'author' }));
    }
  });

  it('should fail if chapters is not an array', () => {
    const invalid = {
      id: 'test-pkg',
      version: '1.0.0',
      name: 'Test',
      author: 'Author',
      chapters: {} // Not an array
    };
    const result = validateManifest(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContainEqual(expect.objectContaining({ path: 'chapters' }));
    }
  });
});
