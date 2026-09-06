import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  calculateFileSha256,
  loadPackage,
  resolveSafeExistingPath,
  type LoadedPackage,
  type LoadError
} from '@learnlab/core';
import type { Result } from '@learnlab/core-types';

export interface DependencyValidationCheck {
  id: string;
  type: 'runtime' | 'prerequisite';
  source?: string;
  status: 'valid' | 'invalid' | 'missing';
  message?: string;
  artifactPath?: string;
  expectedSha256?: string;
  actualSha256?: string;
}

export interface PackageValidationReport {
  package: LoadedPackage;
  dependencyChecks: DependencyValidationCheck[];
}

export async function validatePackageDirectory(
  packageDir: string
): Promise<Result<PackageValidationReport, LoadError>> {
  const loadResult = await loadPackage(packageDir);
  if (!loadResult.ok) {
    return loadResult;
  }

  const normalizedPackageDir = path.resolve(packageDir);
  const manifest = loadResult.value.manifest;
  const dependencyChecks: DependencyValidationCheck[] = [];

  // 1. Check runtime dependencies
  if (manifest.runtime_dependencies) {
    for (const dep of manifest.runtime_dependencies) {
      if (dep.source === 'bundled' || dep.bundled_artifact) {
        if (!dep.bundled_artifact) {
          return {
            ok: false,
            error: {
              type: 'manifest_invalid',
              message: `Runtime dependency '${dep.id}' specifies bundled source but missing bundled_artifact`
            }
          };
        }

        const artifactRelPath = dep.bundled_artifact.path;
        const fullArtifactPath = await resolveSafeExistingPath(
          normalizedPackageDir,
          artifactRelPath,
          normalizedPackageDir
        );
        if (!fullArtifactPath) {
          return {
            ok: false,
            error: {
              type: 'chapter_invalid_path',
              message: `Unsafe bundled artifact path: ${artifactRelPath}`
            }
          };
        }

        try {
          const fileStat = await stat(fullArtifactPath);
          if (!fileStat.isFile()) {
            return {
              ok: false,
              error: {
                type: 'chapter_missing',
                message: `Bundled dependency artifact is not a file: ${artifactRelPath}`
              }
            };
          }

          if (fileStat.size !== dep.bundled_artifact.size) {
            return {
              ok: false,
              error: {
                type: 'manifest_invalid',
                message: `Bundled dependency artifact size mismatch for '${dep.id}': expected ${dep.bundled_artifact.size}, got ${fileStat.size}`
              }
            };
          }

          const actualSha256 = await calculateFileSha256(fullArtifactPath);
          const expectedSha256 = dep.bundled_artifact.sha256.toLowerCase();

          if (actualSha256 !== expectedSha256) {
            dependencyChecks.push({
              id: dep.id,
              type: 'runtime',
              source: dep.source,
              status: 'invalid',
              artifactPath: artifactRelPath,
              expectedSha256,
              actualSha256,
              message: `SHA-256 mismatch for bundled dependency '${dep.id}'`
            });
            return {
              ok: false,
              error: {
                type: 'manifest_invalid',
                message: `SHA-256 mismatch for bundled dependency '${dep.id}': expected ${expectedSha256}, got ${actualSha256}`
              }
            };
          }

          dependencyChecks.push({
            id: dep.id,
            type: 'runtime',
            source: dep.source,
            status: 'valid',
            artifactPath: artifactRelPath,
            expectedSha256,
            actualSha256
          });
        } catch {
          return {
            ok: false,
            error: {
              type: 'chapter_missing',
              message: `Bundled dependency artifact not found: ${artifactRelPath}`
            }
          };
        }
      } else {
        dependencyChecks.push({
          id: dep.id,
          type: 'runtime',
          source: dep.source ?? 'repository',
          status: 'valid'
        });
      }
    }
  }

  // 2. Check external prerequisites
  if (manifest.external_prerequisites) {
    for (const prereq of manifest.external_prerequisites) {
      dependencyChecks.push({
        id: prereq.id,
        type: 'prerequisite',
        status: 'valid',
        message: prereq.reason
      });
    }
  }

  return {
    ok: true,
    value: {
      package: loadResult.value,
      dependencyChecks
    }
  };
}
