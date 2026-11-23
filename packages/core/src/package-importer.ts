import { cp, lstat, mkdtemp, realpath, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { PackageRegisterError, RegisterPackageResult } from '@learnlab/core-types';
import { loadPackage } from './package-loader';
import { WorkspaceManager } from './workspace-manager';

// Per-learner runtime data never travels with a package copy.
const RUNTIME_ENTRIES = new Set(['package.db', 'experiment_history']);

function fail(
  type: PackageRegisterError['type'],
  message: string,
  extra: Partial<PackageRegisterError> = {}
): RegisterPackageResult {
  return { ok: false, error: { type, message, ...extra } };
}

function directoryNameFor(packageId: string): string {
  const slug = packageId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80);
  return slug || 'package';
}

function isInside(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Imports a package directory from anywhere on disk into the workspace and
 * registers it. The workspace is self-contained, so outside sources are copied
 * first (staging directory, then atomic rename); nothing half-copied is left
 * behind on failure, and the source directory is never modified.
 */
export async function importPackageIntoWorkspace(
  workspaceDir: string,
  sourceDir: string
): Promise<RegisterPackageResult> {
  const paths = await WorkspaceManager.initWorkspace(workspaceDir);
  const workspaceReal = await realpath(paths.workspaceDir);

  let sourceRoot: string;
  try {
    sourceRoot = await realpath(path.resolve(sourceDir));
    if (!(await stat(sourceRoot)).isDirectory()) {
      return fail('package_not_found', `Package source is not a directory: ${sourceDir}`);
    }
  } catch (error) {
    return fail('package_not_found', `Cannot read package source '${sourceDir}': ${(error as Error).message}`);
  }

  if (sourceRoot === workspaceReal || isInside(sourceRoot, workspaceReal)) {
    return fail('outside_workspace', `Package source must not contain the workspace itself: ${sourceDir}`);
  }
  // Already a real directory inside the workspace: no copy needed.
  if (isInside(workspaceReal, sourceRoot)) {
    return WorkspaceManager.registerPackage(paths.workspaceDir, sourceRoot);
  }

  const loaded = await loadPackage(sourceRoot);
  if (!loaded.ok) return fail('manifest_invalid', loaded.error.message, { details: loaded.error.details });

  const target = path.join(paths.workspaceDir, directoryNameFor(loaded.value.manifest.id));
  try {
    if (await exists(target)) {
      return fail('package_already_registered', `A package directory already exists in the workspace: ${target}`, { conflictPath: target });
    }
  } catch (error) {
    return fail('read_error', `Cannot inspect ${target}: ${(error as Error).message}`);
  }

  let staging: string | undefined;
  let placed = false;
  try {
    staging = await mkdtemp(path.join(paths.workspaceDir, '.import-'));
    const staged = path.join(staging, 'package');
    await cp(sourceRoot, staged, {
      recursive: true,
      dereference: false,
      filter: async (entry) => {
        if ((await lstat(entry)).isSymbolicLink()) return false;
        return !RUNTIME_ENTRIES.has(path.relative(sourceRoot, entry));
      }
    });
    const check = await loadPackage(staged);
    if (!check.ok) return fail('manifest_invalid', check.error.message, { details: check.error.details });

    await rename(staged, target);
    placed = true;
    const result = await WorkspaceManager.registerPackage(paths.workspaceDir, target);
    if (!result.ok) {
      await rm(target, { recursive: true, force: true });
      placed = false;
    }
    return result;
  } catch (error) {
    if (placed) await rm(target, { recursive: true, force: true }).catch(() => undefined);
    return fail('read_error', `Package import failed: ${(error as Error).message}`);
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}
