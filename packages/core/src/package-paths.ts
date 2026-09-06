import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

function isPathInside(basePath: string, candidatePath: string): boolean {
  const relative = path.relative(basePath, candidatePath);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function normalizeRelativePath(relativePath: string): string | null {
  if (!relativePath || relativePath.includes('\0')) return null;
  // Treat both separators as path separators so archives/manifests created on
  // another platform cannot bypass the check after being moved here.
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return null;
  return relativePath.replace(/[\\/]+/g, path.sep);
}

export function normalizeSafePath(basePath: string, relativePath: string): string | null {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) return null;

  const normalizedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(normalizedBase, normalizedRelativePath);
  return isPathInside(normalizedBase, resolvedPath) ? resolvedPath : null;
}

export function isValidChapterPath(packageDir: string, chapterFile: string): boolean {
  return normalizeSafePath(path.join(packageDir, 'chapters'), chapterFile) !== null;
}

/**
 * Resolves a path lexically and through symlinks, ensuring the existing target
 * remains inside the real path of the supplied base directory.
 */
export async function resolveSafeExistingPath(
  basePath: string,
  relativePath: string,
  containmentRoot = basePath
): Promise<string | null> {
  const lexicalPath = normalizeSafePath(basePath, relativePath);
  if (!lexicalPath) return null;

  try {
    const [realBase, realCandidate, realRoot] = await Promise.all([
      realpath(basePath),
      realpath(lexicalPath),
      realpath(containmentRoot)
    ]);
    const baseRelativeToRoot = path.relative(realRoot, realBase);
    const baseIsInsideRoot = baseRelativeToRoot === '' || isPathInside(realRoot, realBase);
    return baseIsInsideRoot && isPathInside(realBase, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}
