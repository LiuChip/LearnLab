import { describe, it, expect } from 'vitest';
import { validateManifest } from '../packages/core-types/src/validator';

describe('Manifest Validator', () => {
  it('should validate a correct manifest', () => {
    const valid = {
      id: 'test-pkg',
      version: '1.0.0',
      name: 'Test',
      author: 'Author',
      chapters: [{ id: '1', title: 'Chapter 1', file: 'ch1.md' }]
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

  it('should require a valid size and source-compatible bundled artifact', () => {
    const sha256 = 'a'.repeat(64);
    const missingSize = {
      id: 'test-pkg',
      version: '1.0.0',
      name: 'Test',
      author: 'Author',
      chapters: [],
      runtime_dependencies: [
        {
          id: 'org.example.runtime',
          version: '1.0.0',
          provider: 'test',
          source: 'bundled',
          bundled_artifact: { path: 'runtime.tar.gz', sha256 }
        }
      ]
    };
    const missingSizeResult = validateManifest(missingSize);
    expect(missingSizeResult.ok).toBe(false);
    if (!missingSizeResult.ok) {
      expect(missingSizeResult.error).toContainEqual(
        expect.objectContaining({ path: 'runtime_dependencies[0].bundled_artifact.size' })
      );
    }

    const repositoryWithArtifact = {
      ...missingSize,
      runtime_dependencies: [
        {
          id: 'org.example.runtime',
          version: '1.0.0',
          provider: 'test',
          source: 'repository',
          bundled_artifact: { path: 'runtime.tar.gz', sha256, size: 10 }
        }
      ]
    };
    const incompatibleResult = validateManifest(repositoryWithArtifact);
    expect(incompatibleResult.ok).toBe(false);
    if (!incompatibleResult.ok) {
      expect(incompatibleResult.error).toContainEqual(
        expect.objectContaining({
          path: 'runtime_dependencies[0].bundled_artifact',
          message: expect.stringContaining('repository source')
        })
      );
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
