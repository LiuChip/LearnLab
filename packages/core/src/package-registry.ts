import { lstat, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  PackageRegisterError,
  RegisterPackageResult,
  RegisteredPackage,
  WorkspaceState
} from '@learnlab/core-types';

export type { PackageRegisterError };

import { loadPackage } from './package-loader';

export function createEmptyWorkspaceState(): WorkspaceState {
  return {
    version: 1,
    packages: {},
    dependencies: {},
    dependencyLinks: [],
    prerequisites: []
  };
}

export async function registerPackage(
  state: WorkspaceState,
  packageDir: string,
  workspaceDir: string
): Promise<RegisterPackageResult> {
  const resolvedPath = path.resolve(packageDir);

  let packageRealPath: string;

  try {
    const linkStat = await lstat(resolvedPath);
    if (linkStat.isSymbolicLink()) {
      return {
        ok: false,
        error: {
          type: 'symlink_not_allowed',
          message: `Package path must be a real directory inside the workspace, not a symbolic link: ${resolvedPath}`
        }
      };
    }
    if (!linkStat.isDirectory()) {
      return {
        ok: false,
        error: {
          type: 'package_not_found',
          message: `Package path is not a directory: ${resolvedPath}`
        }
      };
    }
  } catch (error) {
    const cause = error as Error;
    return {
      ok: false,
      error: {
        type: 'package_not_found',
        message: `Failed to access package path '${resolvedPath}': ${cause.message}`
      }
    };
  }

  // Ensure target exists and is a directory
  try {
    const targetStat = await stat(resolvedPath);
    if (!targetStat.isDirectory()) {
      return {
        ok: false,
        error: {
          type: 'package_not_found',
          message: `Package target is not a directory: ${resolvedPath}`
        }
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        type: 'package_not_found',
        message: `Package target does not exist: ${resolvedPath}`
      }
    };
  }

  try {
    packageRealPath = await realpath(resolvedPath);
  } catch (error) {
    const cause = error as Error;
    return {
      ok: false,
      error: {
        type: 'package_not_found',
        message: `Failed to resolve package path '${resolvedPath}': ${cause.message}`
      }
    };
  }

  // The workspace is a self-contained folder: every registered package must be a
  // real directory below it. Compare real paths so a symlinked parent cannot
  // smuggle an outside directory past a lexical prefix check.
  let workspaceRealPath: string;
  try {
    workspaceRealPath = await realpath(path.resolve(workspaceDir));
  } catch (error) {
    const cause = error as Error;
    return {
      ok: false,
      error: {
        type: 'read_error',
        message: `Failed to resolve workspace path '${workspaceDir}': ${cause.message}`
      }
    };
  }
  const relativeToWorkspace = path.relative(workspaceRealPath, packageRealPath);
  const firstSegment = relativeToWorkspace.split(path.sep)[0];
  if (
    !relativeToWorkspace ||
    relativeToWorkspace === '..' ||
    relativeToWorkspace.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToWorkspace) ||
    firstSegment === 'dependencies'
  ) {
    return {
      ok: false,
      error: {
        type: 'outside_workspace',
        message: `Package directory must be inside the workspace (outside directories are not registered; copy or import it into the workspace first): ${resolvedPath}`
      }
    };
  }

  const loadResult = await loadPackage(resolvedPath);
  if (!loadResult.ok) {
    return {
      ok: false,
      error: {
        type: 'manifest_invalid',
        message: loadResult.error.message,
        details: loadResult.error.details
      }
    };
  }

  const manifest = loadResult.value.manifest;

  // Check ID collision
  const existingById = state.packages[manifest.id];
  if (existingById) {
    return {
      ok: false,
      error: {
        type: 'package_already_registered',
        message: `Package ID '${manifest.id}' is already registered from '${existingById.path}'`,
        conflictPath: existingById.path
      }
    };
  }

  // Do not register the same physical directory twice under different IDs.
  // This also catches two distinct symlink paths that resolve to one package.
  for (const pkg of Object.values(state.packages)) {
    if (pkg.id === manifest.id) continue;
    try {
      if ((await realpath(pkg.path)) === packageRealPath) {
        return {
          ok: false,
          error: {
            type: 'path_conflict',
            message: `Package path '${resolvedPath}' is already registered as '${pkg.id}'`,
            conflictPath: pkg.path
          }
        };
      }
    } catch {
      // Ignore stale records; the normal package load/registration path can
      // repair them later without blocking unrelated packages.
    }
  }

  // Check Name collision with a different package
  for (const pkg of Object.values(state.packages)) {
    if (pkg.name.toLowerCase() === manifest.name.toLowerCase() && pkg.id !== manifest.id) {
      return {
        ok: false,
        error: {
          type: 'name_conflict',
          message: `Package name '${manifest.name}' conflicts with registered package '${pkg.id}' at '${pkg.path}'`,
          conflictPath: pkg.path
        }
      };
    }
  }

  const record: RegisteredPackage = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    path: resolvedPath,
    // Legacy field kept only so old workspace.db records stay readable.
    isSymlink: false,
    registeredAt: new Date().toISOString()
  };

  state.packages[manifest.id] = record;

  return { ok: true, value: record };
}

export function unregisterPackage(state: WorkspaceState, packageId: string): boolean {
  if (state.packages[packageId]) {
    delete state.packages[packageId];
    state.dependencyLinks = state.dependencyLinks.filter((link) => link.packageId !== packageId);
    state.prerequisites = state.prerequisites.filter((req) => req.packageId !== packageId);
    return true;
  }
  return false;
}

export function listRegisteredPackages(state: WorkspaceState): RegisteredPackage[] {
  return Object.values(state.packages);
}

export function getRegisteredPackage(
  state: WorkspaceState,
  packageId: string
): RegisteredPackage | undefined {
  return state.packages[packageId];
}
