import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  rename,
  stat,
  writeFile
} from 'node:fs/promises';
import * as path from 'node:path';
import type {
  DependencyImportOptions,
  ImportDependencyResult,
  DependencyImportError
} from '@learnlab/core-types';
import {
  calculateFileSha256,
  calculateFileStats,
  dependencyFingerprint
} from './dependency-fingerprint';
import { getDependencyInstallPath } from './dependency-paths';
import { resolveSafeExistingPath } from './package-paths';
import { parseTar } from './tar';

const INSTALL_METADATA_FILE = '.learnlab-install.json';
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;

interface InstalledEntryRecord {
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  sha256?: string;
  linkname?: string;
}

interface InstallMetadata {
  formatVersion: 1;
  fingerprint: string;
  archiveSha256: string;
  entries: InstalledEntryRecord[];
}

const importLocks = new Map<string, Promise<void>>();

async function withImportLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = importLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  importLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (importLocks.get(key) === current) importLocks.delete(key);
  }
}

function isPathInside(basePath: string, candidatePath: string): boolean {
  const relative = path.relative(basePath, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeArchiveRelativePath(value: string): string | null {
  if (!value || value.includes('\0')) return null;
  const normalized = value.replace(/[\\/]+/g, path.sep);
  if (path.isAbsolute(normalized) || path.win32.isAbsolute(value)) return null;
  return normalized;
}

function safeArchiveEntryPath(basePath: string, entryName: string): string | null {
  const normalizedName = normalizeArchiveRelativePath(entryName);
  if (!normalizedName) return null;
  const candidate = path.resolve(basePath, normalizedName);
  return isPathInside(basePath, candidate) ? candidate : null;
}

async function ensureDirectoryTree(root: string, target: string): Promise<void> {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path is outside directory root: ${target}`);
  }

  let current = normalizedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${current}`);
      if (!entry.isDirectory()) throw new Error(`Expected directory: ${current}`);
    } catch (error) {
      const cause = error as NodeJS.ErrnoException;
      if (cause.code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
}

async function ensureWorkspaceDependenciesDirectory(workspaceDir: string): Promise<string> {
  const workspaceRoot = path.resolve(workspaceDir);
  await mkdir(workspaceRoot, { recursive: true });
  const dependenciesRoot = path.join(workspaceRoot, 'dependencies');

  try {
    const entry = await lstat(dependenciesRoot);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Workspace dependencies directory must not be a symbolic link: ${dependenciesRoot}`
      );
    }
    if (!entry.isDirectory()) throw new Error(`Workspace dependencies path is not a directory`);
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    if (cause.code !== 'ENOENT') throw error;
    await mkdir(dependenciesRoot);
  }

  const [realWorkspaceRoot, realDependenciesRoot] = await Promise.all([
    realpath(workspaceRoot),
    realpath(dependenciesRoot)
  ]);
  if (!isPathInside(realWorkspaceRoot, realDependenciesRoot)) {
    throw new Error(`Workspace dependencies directory escapes workspace: ${dependenciesRoot}`);
  }
  return dependenciesRoot;
}

function importError(type: DependencyImportError['type'], message: string): ImportDependencyResult {
  return { ok: false, error: { type, message } };
}

async function readInstallMetadata(installPath: string): Promise<InstallMetadata | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.join(installPath, INSTALL_METADATA_FILE), 'utf8')
    ) as Partial<InstallMetadata>;
    if (
      raw.formatVersion !== 1 ||
      typeof raw.fingerprint !== 'string' ||
      typeof raw.archiveSha256 !== 'string' ||
      !Array.isArray(raw.entries)
    ) {
      return null;
    }
    return raw as InstallMetadata;
  } catch {
    return null;
  }
}

async function collectRelativeEntries(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string, relative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (relative === '' && entry.name === INSTALL_METADATA_FILE) continue;
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      result.push(childRelative);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await visit(path.join(current, entry.name), childRelative);
      }
    }
  }
  await visit(root, '');
  return result.sort();
}

async function collectInstallEntries(root: string): Promise<InstalledEntryRecord[]> {
  const result: InstalledEntryRecord[] = [];

  async function visit(current: string, relative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (relative === '' && entry.name === INSTALL_METADATA_FILE) continue;
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const childPath = path.join(current, entry.name);
      const childStat = await lstat(childPath);
      if (childStat.isSymbolicLink()) {
        result.push({
          path: childRelative,
          type: 'symlink',
          linkname: await readlink(childPath)
        });
      } else if (childStat.isDirectory()) {
        result.push({ path: childRelative, type: 'directory' });
        await visit(childPath, childRelative);
      } else if (childStat.isFile()) {
        result.push({
          path: childRelative,
          type: 'file',
          size: childStat.size,
          sha256: await calculateFileSha256(childPath)
        });
      } else {
        throw new Error(`Unsupported extracted entry type: ${childRelative}`);
      }
    }
  }

  await visit(root, '');
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

async function verifyExistingInstall(
  installPath: string,
  fingerprint: string,
  expectedArchiveSha256: string
): Promise<boolean> {
  const rootStat = await lstat(installPath);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return false;

  const metadata = await readInstallMetadata(installPath);
  if (
    !metadata ||
    metadata.fingerprint !== fingerprint ||
    metadata.archiveSha256.toLowerCase() !== expectedArchiveSha256.toLowerCase()
  ) {
    return false;
  }

  const expectedPaths = metadata.entries.map((entry) => entry.path).sort();
  const actualPaths = await collectRelativeEntries(installPath);
  if (expectedPaths.length !== actualPaths.length) return false;
  if (expectedPaths.some((entry, index) => entry !== actualPaths[index])) return false;

  for (const entry of metadata.entries) {
    const entryPath = safeArchiveEntryPath(installPath, entry.path);
    if (!entryPath) return false;
    const entryStat = await lstat(entryPath);
    if (entry.type === 'directory') {
      if (!entryStat.isDirectory() || entryStat.isSymbolicLink()) return false;
    } else if (entry.type === 'symlink') {
      if (!entryStat.isSymbolicLink() || !entry.linkname) return false;
      if ((await readlink(entryPath)) !== entry.linkname) return false;
      const normalizedLinkname = normalizeArchiveRelativePath(entry.linkname);
      const resolvedLinkTarget = normalizedLinkname
        ? path.resolve(path.dirname(entryPath), normalizedLinkname)
        : null;
      if (!resolvedLinkTarget || !isPathInside(installPath, resolvedLinkTarget)) return false;
    } else {
      if (!entryStat.isFile() || entryStat.isSymbolicLink()) return false;
      if (
        entry.size !== entryStat.size ||
        entry.sha256 !== (await calculateFileSha256(entryPath))
      ) {
        return false;
      }
    }
  }
  return true;
}

async function importBundledDependencyUnlocked(
  options: DependencyImportOptions,
  sourceFile: string,
  installPath: string,
  fingerprint: string
): Promise<ImportDependencyResult> {
  const { workspaceDir, metadata } = options;
  let tempDir: string | undefined;
  try {
    const dependenciesRoot = await ensureWorkspaceDependenciesDirectory(workspaceDir);
    await ensureDirectoryTree(dependenciesRoot, path.dirname(installPath));

    tempDir = path.join(
      dependenciesRoot,
      `.tmp-import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    );
    await mkdir(tempDir);
    const tempArchive = path.join(tempDir, 'source.archive');
    const stagingDir = path.join(tempDir, 'staging');

    await copyFile(sourceFile, tempArchive);
    const { size, sha256 } = await calculateFileStats(tempArchive);

    if (size > MAX_ARCHIVE_BYTES) {
      return importError('unsupported_archive', `Archive exceeds maximum size: ${size} bytes`);
    }
    if (metadata.archive.size !== size) {
      return importError(
        'size_mismatch',
        `Archive size mismatch: expected ${metadata.archive.size}, got ${size}`
      );
    }
    if (sha256.toLowerCase() !== metadata.archive.sha256.toLowerCase()) {
      return importError(
        'hash_mismatch',
        `Archive SHA-256 mismatch: expected ${metadata.archive.sha256.toLowerCase()}, got ${sha256.toLowerCase()}`
      );
    }

    try {
      const existingStat = await lstat(installPath);
      if (existingStat.isSymbolicLink()) {
        return importError(
          'symlink_escape',
          `Dependency install path is a symbolic link: ${installPath}`
        );
      }
      if (!existingStat.isDirectory()) {
        return importError(
          'io_error',
          `Dependency install path is not a directory: ${installPath}`
        );
      }
      if (await verifyExistingInstall(installPath, fingerprint, sha256)) {
        return {
          ok: true,
          value: {
            installPath,
            fingerprint,
            reused: true,
            extractedFiles: (await readInstallMetadata(installPath))!.entries
              .filter((entry) => entry.type !== 'directory')
              .map((entry) => entry.path)
          }
        };
      }
      return importError(
        'io_error',
        `Dependency install path exists but failed integrity verification: ${installPath}`
      );
    } catch (error) {
      const cause = error as NodeJS.ErrnoException;
      if (cause.code !== 'ENOENT') throw error;
    }

    await mkdir(stagingDir);
    const archiveBuffer = await readFile(tempArchive);
    const entries = parseTar(archiveBuffer, {
      maxInputBytes: MAX_ARCHIVE_BYTES,
      maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
      maxEntries: MAX_ARCHIVE_ENTRIES
    });
    const extractedFiles: string[] = [];
    const seenPaths = new Set<string>();

    for (const entry of entries) {
      const entryName = entry.name.replace(/[\\/]+/g, path.sep);
      const targetPath = safeArchiveEntryPath(stagingDir, entryName);
      if (!targetPath) {
        return importError('path_traversal', `Archive entry has an invalid path: ${entry.name}`);
      }
      const relativeEntryPath = path.relative(stagingDir, targetPath);
      if (seenPaths.has(relativeEntryPath)) {
        return importError(
          'unsupported_archive',
          `Archive contains duplicate entry: ${entry.name}`
        );
      }
      seenPaths.add(relativeEntryPath);

      if (entry.type === '2') {
        const linkname = entry.linkname;
        if (
          !linkname ||
          linkname.includes('\0') ||
          path.isAbsolute(linkname) ||
          path.win32.isAbsolute(linkname)
        ) {
          return importError(
            'symlink_escape',
            `Archive symlink has an invalid target: ${linkname ?? ''}`
          );
        }
        const normalizedLinkname = normalizeArchiveRelativePath(linkname);
        const resolvedLinkTarget = normalizedLinkname
          ? path.resolve(path.dirname(targetPath), normalizedLinkname)
          : null;
        if (!resolvedLinkTarget || !isPathInside(stagingDir, resolvedLinkTarget)) {
          return importError(
            'symlink_escape',
            `Archive symlink targets outside staging: ${linkname}`
          );
        }
        await mkdir(path.dirname(targetPath), { recursive: true });
        await symlink(linkname, targetPath);
        extractedFiles.push(entry.name);
      } else if (entry.type === '5' || entry.name.endsWith('/')) {
        await mkdir(targetPath, { recursive: true });
      } else if (entry.type === '0' || entry.type === '\0') {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, entry.data, { mode: entry.mode });
        extractedFiles.push(entry.name);
      } else {
        return importError('unsupported_archive', `Unsupported tar entry type: ${entry.type}`);
      }
    }

    const installMetadata: InstallMetadata = {
      formatVersion: 1,
      fingerprint,
      archiveSha256: sha256,
      entries: await collectInstallEntries(stagingDir)
    };
    await writeFile(
      path.join(stagingDir, INSTALL_METADATA_FILE),
      `${JSON.stringify(installMetadata, null, 2)}\n`,
      'utf8'
    );

    // The fingerprint lock serializes competing imports within this process.
    // A second process can still win the rename race, so re-check that target
    // before reporting a failure and never remove the other process's files.
    try {
      await rename(stagingDir, installPath);
    } catch (error) {
      const cause = error as NodeJS.ErrnoException;
      if (cause.code === 'EEXIST' || cause.code === 'ENOTEMPTY') {
        if (await verifyExistingInstall(installPath, fingerprint, sha256)) {
          return {
            ok: true,
            value: {
              installPath,
              fingerprint,
              reused: true,
              extractedFiles: (await readInstallMetadata(installPath))!.entries
                .filter((entry) => entry.type !== 'directory')
                .map((entry) => entry.path)
            }
          };
        }
        return importError(
          'io_error',
          `Dependency install path was concurrently created but failed integrity verification: ${installPath}`
        );
      }
      throw error;
    }

    return {
      ok: true,
      value: { installPath, fingerprint, reused: false, extractedFiles }
    };
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    const type: DependencyImportError['type'] =
      cause.message?.includes('Tar') || cause.message?.includes('archive')
        ? 'unsupported_archive'
        : 'extraction_failed';
    return importError(type, `Failed to import dependency: ${cause.message}`);
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function importBundledDependency(
  options: DependencyImportOptions
): Promise<ImportDependencyResult> {
  const { workspaceDir, archivePath, metadata, packageDir } = options;
  let sourceFile: string;
  try {
    if (packageDir) {
      const safeSource = await resolveSafeExistingPath(
        path.resolve(packageDir),
        archivePath,
        path.resolve(packageDir)
      );
      if (!safeSource) {
        return importError(
          'path_traversal',
          `Archive path escapes package directory: ${archivePath}`
        );
      }
      sourceFile = safeSource;
    } else {
      sourceFile = path.resolve(archivePath);
    }

    const fileStat = await stat(sourceFile);
    if (!fileStat.isFile()) {
      return importError('file_not_found', `Archive is not a file: ${sourceFile}`);
    }
  } catch {
    return importError('file_not_found', `Archive file not found: ${archivePath}`);
  }

  let installPath: string;
  let fingerprint: string;
  try {
    installPath = getDependencyInstallPath(workspaceDir, metadata);
    fingerprint = dependencyFingerprint(metadata);
  } catch (error) {
    const cause = error as Error;
    return importError('io_error', `Invalid install path: ${cause.message}`);
  }

  return withImportLock(installPath, () =>
    importBundledDependencyUnlocked(options, sourceFile, installPath, fingerprint)
  );
}
