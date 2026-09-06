import { access, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ImportDependencyResult, RegisteredPackage, RegisterPackageResult,
  WorkspaceDependencyRecord, WorkspacePaths, WorkspacePrerequisiteRecord, WorkspaceState
} from '@learnlab/core-types';
import {
  createEmptyWorkspaceState, registerPackage as registerPackageInternal
} from './package-registry';
import { loadPackage } from './package-loader';
import { getWorkspacePaths } from './dependency-paths';
import { importBundledDependency } from './dependency-importer';
import { dependencyFingerprint } from './dependency-fingerprint';
import { resolveSafeExistingPath } from './package-paths';
import { WorkspaceDatabase } from './database/workspace-db';

const workspaceLocks = new Map<string, Promise<void>>();

async function withWorkspaceLock<T>(workspaceDir: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(workspaceDir);
  const previous = workspaceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  workspaceLocks.set(key, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (workspaceLocks.get(key) === current) workspaceLocks.delete(key); }
}

function getWorkspaceStateFile(workspaceDir: string): string { return path.join(path.resolve(workspaceDir), 'workspace.json'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.packages) || !isRecord(value.dependencies) || !Array.isArray(value.dependencyLinks) || !Array.isArray(value.prerequisites)) return false;
  for (const [id, pkg] of Object.entries(value.packages)) {
    if (!isRecord(pkg) || id !== pkg.id || typeof pkg.name !== 'string' || typeof pkg.version !== 'string' || typeof pkg.path !== 'string' || typeof pkg.isSymlink !== 'boolean' || typeof pkg.registeredAt !== 'string') return false;
  }
  for (const dependency of Object.values(value.dependencies)) {
    if (!isRecord(dependency) || typeof dependency.dependencyId !== 'string' || typeof dependency.version !== 'string' || typeof dependency.platform !== 'string' || typeof dependency.arch !== 'string' || typeof dependency.sha256 !== 'string' || typeof dependency.path !== 'string' || !['repository', 'bundled'].includes(String(dependency.sourceType)) || !['installed', 'missing', 'failed'].includes(String(dependency.status))) return false;
  }
  for (const link of value.dependencyLinks) {
    if (!isRecord(link) || typeof link.packageId !== 'string' || typeof link.dependencyId !== 'string' || typeof link.requiredVersion !== 'string' || !['repository', 'bundled', 'either'].includes(String(link.sourceType)) || !['ready', 'missing', 'failed'].includes(String(link.status))) return false;
  }
  for (const prerequisite of value.prerequisites) {
    if (!isRecord(prerequisite) || typeof prerequisite.packageId !== 'string' || typeof prerequisite.prerequisiteId !== 'string' || typeof prerequisite.version !== 'string' || typeof prerequisite.required !== 'boolean') return false;
  }
  return true;
}

export async function loadWorkspaceState(workspaceDir: string): Promise<WorkspaceState> {
  const file = getWorkspaceStateFile(workspaceDir);
  try {
    const content = await readFile(file, 'utf8');
    let parsed: unknown;
    try { parsed = JSON.parse(content); }
    catch (error) { throw new Error(`Workspace state is invalid JSON: ${(error as Error).message}`); }
    if (!isWorkspaceState(parsed)) throw new Error(`Workspace state has an unsupported or invalid schema: ${file}`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return createEmptyWorkspaceState();
    throw error;
  }
}

export async function saveWorkspaceState(workspaceDir: string, state: WorkspaceState): Promise<void> {
  if (!isWorkspaceState(state)) throw new Error('Cannot save invalid workspace state');
  const root = path.resolve(workspaceDir);
  await mkdir(root, { recursive: true });
  const file = getWorkspaceStateFile(root);
  const tempFile = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  try { await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); await rename(tempFile, file); }
  finally { await rm(tempFile, { force: true }).catch(() => undefined); }
}

function stateFromDatabase(db: WorkspaceDatabase): WorkspaceState {
  const state = createEmptyWorkspaceState();
  for (const pkg of db.listPackages()) state.packages[pkg.id] = pkg;
  for (const dependency of db.getDependencies()) state.dependencies[dependencyFingerprint({
    id: dependency.dependencyId, version: dependency.version, platform: dependency.platform,
    arch: dependency.arch, archive: { file: path.basename(dependency.path), sha256: dependency.sha256, size: 0 }
  })] = dependency;
  for (const pkg of db.listPackages()) {
    state.dependencyLinks.push(...db.getPackageDependencies(pkg.id));
    state.prerequisites.push(...db.getPrerequisites(pkg.id));
  }
  return state;
}

function populateDatabase(db: WorkspaceDatabase, state: WorkspaceState): void {
  db.getConnection().transaction(() => {
    for (const pkg of Object.values(state.packages)) db.registerPackage(pkg);
    for (const dependency of Object.values(state.dependencies)) db.recordDependency(dependency);
    for (const link of state.dependencyLinks) db.linkPackageDependency(link);
    for (const prerequisite of state.prerequisites) db.recordPrerequisite(prerequisite);
  });
}

async function initWorkspaceUnlocked(workspaceDir: string): Promise<WorkspacePaths> {
  const paths = getWorkspacePaths(workspaceDir);
  await mkdir(paths.workspaceDir, { recursive: true });
  try {
    const dependencyEntry = await lstat(paths.dependenciesDir);
    if (dependencyEntry.isSymbolicLink()) throw new Error(`Workspace dependencies directory must not be a symbolic link: ${paths.dependenciesDir}`);
    if (!dependencyEntry.isDirectory()) throw new Error(`Workspace dependencies path is not a directory: ${paths.dependenciesDir}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await mkdir(paths.dependenciesDir);
  }
  const [realWorkspace, realDependencies] = await Promise.all([realpath(paths.workspaceDir), realpath(paths.dependenciesDir)]);
  const relative = path.relative(realWorkspace, realDependencies);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Workspace dependencies directory escapes workspace: ${paths.dependenciesDir}`);

  // workspace.json is retained only as a one-time legacy migration source.
  // Once workspace.db exists it is authoritative, so a stale or corrupt legacy
  // file must not prevent the database-backed workspace from opening.
  const databasePath = path.join(paths.workspaceDir, 'workspace.db');
  let databaseExists = true;
  try { await access(databasePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') databaseExists = false;
    else throw error;
  }
  const legacyState = databaseExists ? createEmptyWorkspaceState() : await loadWorkspaceState(paths.workspaceDir);
  const db = WorkspaceDatabase.open(paths.workspaceDir);
  try {
    if (!databaseExists && (Object.keys(legacyState.packages).length > 0 || Object.keys(legacyState.dependencies).length > 0 || legacyState.dependencyLinks.length > 0 || legacyState.prerequisites.length > 0)) populateDatabase(db, legacyState);
  } finally { db.close(); }
  if (!databaseExists) await saveWorkspaceState(paths.workspaceDir, legacyState);
  return paths;
}

async function withDatabase<T>(workspaceDir: string, operation: (db: WorkspaceDatabase) => Promise<T> | T): Promise<T> {
  await initWorkspaceUnlocked(workspaceDir);
  const db = WorkspaceDatabase.open(workspaceDir);
  try { return await operation(db); } finally { db.close(); }
}

export class WorkspaceManager {
  static async initWorkspace(workspaceDir: string): Promise<WorkspacePaths> { return withWorkspaceLock(workspaceDir, () => initWorkspaceUnlocked(workspaceDir)); }

  static async registerPackage(workspaceDir: string, packageDir: string): Promise<RegisterPackageResult> {
    return withWorkspaceLock(workspaceDir, async () => {
      await initWorkspaceUnlocked(workspaceDir);
      const db = WorkspaceDatabase.open(workspaceDir);
      try {
        const state = stateFromDatabase(db);
        const result = await registerPackageInternal(state, packageDir);
        if (!result.ok) return result;
        const loaded = await loadPackage(result.value.path);
        if (!loaded.ok) return { ok: false, error: { type: 'manifest_invalid', message: loaded.error.message, details: loaded.error.details } };
        const manifest = loaded.value.manifest;
        db.getConnection().transaction(() => {
          db.registerPackage(result.value);
          for (const dep of manifest.runtime_dependencies ?? []) db.linkPackageDependency({ packageId: result.value.id, dependencyId: dep.id, requiredVersion: dep.version, sourceType: dep.source ?? 'repository', status: 'missing' });
          for (const req of manifest.external_prerequisites ?? []) db.recordPrerequisite({ packageId: result.value.id, prerequisiteId: req.id, version: req.version, required: req.required, ...(req.reason ? { reason: req.reason } : {}), ...(req.detect ? { detect: req.detect } : {}) });
        });
        return result;
      } finally { db.close(); }
    });
  }

  static async unregisterPackage(workspaceDir: string, packageId: string): Promise<boolean> {
    return withWorkspaceLock(workspaceDir, async () => withDatabase(workspaceDir, (db) => db.unregisterPackage(packageId)));
  }

  static async listPackages(workspaceDir: string): Promise<RegisteredPackage[]> {
    return withWorkspaceLock(workspaceDir, async () => withDatabase(workspaceDir, (db) => db.listPackages()));
  }

  static async getPackage(workspaceDir: string, packageId: string): Promise<RegisteredPackage | undefined> {
    return withWorkspaceLock(workspaceDir, async () => withDatabase(workspaceDir, (db) => db.getPackage(packageId)));
  }

  static async importBundledDependency(workspaceDir: string, packageId: string, dependencyId: string, currentPlatform = process.platform, currentArch = process.arch): Promise<ImportDependencyResult> {
    return withWorkspaceLock(workspaceDir, async () => {
      await initWorkspaceUnlocked(workspaceDir);
      const db = WorkspaceDatabase.open(workspaceDir);
      try {
        const pkg = db.getPackage(packageId);
        if (!pkg) return { ok: false, error: { type: 'file_not_found', message: `Package '${packageId}' is not registered in workspace` } };
        const loaded = await loadPackage(pkg.path);
        if (!loaded.ok) return { ok: false, error: { type: 'file_not_found', message: `Failed to load package manifest: ${loaded.error.message}` } };
        const depDecl = loaded.value.manifest.runtime_dependencies?.find((dependency) => dependency.id === dependencyId);
        if (!depDecl) return { ok: false, error: { type: 'file_not_found', message: `Package '${packageId}' does not declare runtime dependency '${dependencyId}'` } };
        if (depDecl.source === 'repository' || !depDecl.bundled_artifact) return { ok: false, error: { type: 'unsupported_archive', message: `Dependency '${dependencyId}' is not a bundled dependency with an artifact` } };
        const artifactPath = await resolveSafeExistingPath(pkg.path, depDecl.bundled_artifact.path, pkg.path);
        if (!artifactPath) return { ok: false, error: { type: 'path_traversal', message: `Bundled dependency artifact escapes package directory: ${depDecl.bundled_artifact.path}` } };
        const metadata = { id: depDecl.id, version: depDecl.version, platform: currentPlatform, arch: currentArch, archive: { file: path.basename(artifactPath), sha256: depDecl.bundled_artifact.sha256, size: depDecl.bundled_artifact.size } };
        const importResult = await importBundledDependency({ workspaceDir, archivePath: depDecl.bundled_artifact.path, metadata, packageDir: pkg.path });
        if (!importResult.ok) return importResult;
        try {
          db.getConnection().transaction(() => {
            db.recordDependency({ dependencyId: depDecl.id, version: depDecl.version, platform: currentPlatform, arch: currentArch, sha256: depDecl.bundled_artifact!.sha256, path: importResult.value.installPath, sourceType: 'bundled', sourcePackageId: packageId, status: 'installed', installedAt: new Date().toISOString() });
            const link = db.getPackageDependencies(packageId).find((candidate) => candidate.dependencyId === depDecl.id && candidate.requiredVersion === depDecl.version);
            if (link) db.linkPackageDependency({ ...link, resolvedVersion: depDecl.version, resolvedSha256: depDecl.bundled_artifact!.sha256, status: 'ready' });
          });
        } catch (error) {
          if (!importResult.value.reused) await rm(importResult.value.installPath, { recursive: true, force: true }).catch(() => undefined);
          return { ok: false, error: { type: 'io_error', message: `Failed to save workspace database: ${(error as Error).message}` } };
        }
        return importResult;
      } finally { db.close(); }
    });
  }

  static async getWorkspaceDependencies(workspaceDir: string): Promise<WorkspaceDependencyRecord[]> { return withWorkspaceLock(workspaceDir, async () => withDatabase(workspaceDir, (db) => db.getDependencies())); }
  static async getWorkspacePrerequisites(workspaceDir: string): Promise<WorkspacePrerequisiteRecord[]> {
    return withWorkspaceLock(workspaceDir, async () => withDatabase(workspaceDir, (db) => db.getAllPrerequisites()));
  }
}
