import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as yamlParse } from 'yaml';
import { PackageManifest, validateManifest, Result } from '@learnlab/core-types';
import { isValidChapterPath, resolveSafeExistingPath } from './package-paths';

export interface LoadError {
  type: 'manifest_missing' | 'manifest_invalid' | 'chapter_missing' | 'chapter_invalid_path' | 'read_error';
  message: string;
  details?: unknown;
}

export interface LoadedPackage {
  dir: string;
  manifest: PackageManifest;
}

async function readManifest(packageDir: string): Promise<Result<PackageManifest, LoadError>> {
  const manifestPath = path.join(packageDir, 'manifest.yaml');
  let manifestContent: string;
  try {
    manifestContent = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    if (cause.code === 'ENOENT') {
      return { ok: false, error: { type: 'manifest_missing', message: `manifest.yaml not found in ${packageDir}` } };
    }
    return { ok: false, error: { type: 'read_error', message: `Failed to read manifest.yaml: ${cause.message}` } };
  }

  let rawManifest: unknown;
  try {
    rawManifest = yamlParse(manifestContent);
  } catch (error) {
    const cause = error as Error;
    return { ok: false, error: { type: 'manifest_invalid', message: `Invalid YAML in manifest.yaml: ${cause.message}` } };
  }

  const validation = validateManifest(rawManifest);
  if (!validation.ok) {
    return { ok: false, error: { type: 'manifest_invalid', message: 'Manifest validation failed', details: validation.error } };
  }
  return { ok: true, value: validation.value };
}

export async function loadPackage(packageDir: string): Promise<Result<LoadedPackage, LoadError>> {
  const normalizedPackageDir = path.resolve(packageDir);
  try {
    const manifestResult = await readManifest(normalizedPackageDir);
    if (!manifestResult.ok) return manifestResult;

    const chaptersDir = path.join(normalizedPackageDir, 'chapters');
    for (const chapter of manifestResult.value.chapters) {
      if (!isValidChapterPath(normalizedPackageDir, chapter.file)) {
        return { ok: false, error: { type: 'chapter_invalid_path', message: `Chapter '${chapter.id}' uses an invalid or unsafe path: ${chapter.file}` } };
      }

      const chapterPath = await resolveSafeExistingPath(chaptersDir, chapter.file, normalizedPackageDir);
      if (!chapterPath) {
        return { ok: false, error: { type: 'chapter_invalid_path', message: `Chapter '${chapter.id}' resolves outside the package or does not exist: ${chapter.file}` } };
      }

      try {
        const stat = await fs.stat(chapterPath);
        if (!stat.isFile()) {
          return { ok: false, error: { type: 'chapter_missing', message: `Chapter file is not a file: ${chapter.file}` } };
        }
      } catch {
        return { ok: false, error: { type: 'chapter_missing', message: `Chapter file not found: ${chapter.file}` } };
      }
    }

    return { ok: true, value: { dir: normalizedPackageDir, manifest: manifestResult.value } };
  } catch (error) {
    const cause = error as Error;
    return { ok: false, error: { type: 'read_error', message: cause.message } };
  }
}

export async function readChapter(packageDir: string, chapterFile: string): Promise<Result<string, LoadError>> {
  const normalizedPackageDir = path.resolve(packageDir);
  if (!isValidChapterPath(normalizedPackageDir, chapterFile)) {
    return { ok: false, error: { type: 'chapter_invalid_path', message: `Unsafe chapter path: ${chapterFile}` } };
  }

  const chapterPath = await resolveSafeExistingPath(path.join(normalizedPackageDir, 'chapters'), chapterFile, normalizedPackageDir);
  if (!chapterPath) {
    return { ok: false, error: { type: 'chapter_invalid_path', message: `Chapter path is missing or escapes the package: ${chapterFile}` } };
  }

  try {
    const stat = await fs.stat(chapterPath);
    if (!stat.isFile()) return { ok: false, error: { type: 'chapter_missing', message: `Chapter file is not a file: ${chapterFile}` } };
    return { ok: true, value: await fs.readFile(chapterPath, 'utf8') };
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    return { ok: false, error: { type: cause.code === 'ENOENT' ? 'chapter_missing' : 'read_error', message: `Failed to read chapter: ${cause.message}` } };
  }
}
