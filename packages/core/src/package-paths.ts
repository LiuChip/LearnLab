import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

function isPathInside(basePath: string, candidatePath: string): boolean {
  const relative = path.relative(basePath, candidatePath);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function normalizeSafePath(basePath: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) return null;

  const normalizedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(normalizedBase, relativePath);
  return isPathInside(normalizedBase, resolvedPath) ? resolvedPath : null;
}

export function isValidChapterPath(packageDir: string, chapterFile: string): boolean {
  return normalizeSafePath(path.join(packageDir, 'chapters'), chapterFile) !== null;
}

/**
 * Resolves a path lexically and through symlinks, ensuring the existing target
 * remains inside the real path of the supplied base directory.
 */
export async function resolveSafeExistingPath(basePath: string, relativePath: string, containmentRoot = basePath): Promise<string | null> {
  const lexicalPath = normalizeSafePath(basePath, relativePath);
  if (!lexicalPath) return null;

  try {
    const [realBase, realCandidate, realRoot] = await Promise.all([realpath(basePath), realpath(lexicalPath), realpath(containmentRoot)]);
    const baseRelativeToRoot = path.relative(realRoot, realBase);
    const baseIsInsideRoot = baseRelativeToRoot === '' || isPathInside(realRoot, realBase);
    return baseIsInsideRoot && isPathInside(realBase, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}
