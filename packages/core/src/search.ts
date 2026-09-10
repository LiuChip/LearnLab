import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PackageManifest, RegisteredPackage } from '@learnlab/core-types';
import { isValidChapterPath, resolveSafeExistingPath } from './package-paths';
import { loadPackageManifest } from './package-loader';

export interface SearchOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  isRegex?: boolean;
}

export interface SearchTargetInfo {
  packageId: string;
  packageName: string;
  chapterId: string;
  chapterTitle: string;
  chapterFile: string;
}

export interface SearchMatch {
  packageId: string;
  packageName: string;
  chapterId: string;
  chapterTitle: string;
  chapterFile: string;
  line: number;
  column: number;
  length: number;
  matchText: string;
  lineContent: string;
  preview: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  totalMatches: number;
  searchedChapters: number;
  searchedPackages: number;
  skippedChapters: number;
  skippedPackages: number;
  warnings: string[];
  error?: string;
}

export interface ReplaceOptions extends SearchOptions {
  replaceWith: string;
  preserveCase?: boolean;
}

export interface ReplaceResult {
  newContent: string;
  replacementsCount: number;
  error?: string;
}

const MAX_REGEX_LENGTH = 300;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Basic heuristic check to prevent obvious catastrophic backtracking patterns.
 * Distinguishes unescaped groups with nested quantifiers like (a+)+, (.*)*, (a+){2,}
 * from escaped literal parentheses like \(\d+\)+.
 */
function hasCatastrophicBacktracking(pattern: string): boolean {
  return /(?<!\\)\((?:[^)\\]|\\.)*[+*](?<!\\)\)(?:[+*]|\{\d+,?\d*\})|(?<!\\)\[(?:[^\]\\]|\\.)*\][+*]{2,}/.test(pattern);
}

export function compileSearchPattern(options: SearchOptions): { regex?: RegExp; error?: string } {
  const query = options.query;
  if (!query) {
    return { error: 'Search query cannot be empty' };
  }

  let pattern = query;
  if (options.isRegex) {
    if (pattern.length > MAX_REGEX_LENGTH) {
      return { error: `Regular expression is too long (max ${MAX_REGEX_LENGTH} characters)` };
    }
    if (hasCatastrophicBacktracking(pattern)) {
      return { error: 'Regular expression contains potentially unsafe nested quantifiers' };
    }
  } else {
    pattern = escapeRegex(pattern);
  }

  if (options.wholeWord) {
    pattern = `\\b(?:${pattern})\\b`;
  }

  const flags = options.caseSensitive ? 'g' : 'gi';
  try {
    const regex = new RegExp(pattern, flags);
    return { regex };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { error: `Invalid regular expression: ${message}` };
  }
}

function createSnippetPreview(
  line: string,
  matchIndex: number,
  matchLength: number,
  maxContext = 30
): string {
  const start = Math.max(0, matchIndex - maxContext);
  const end = Math.min(line.length, matchIndex + matchLength + maxContext);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < line.length ? '...' : '';
  return `${prefix}${line.slice(start, end).trim()}${suffix}`;
}

export function searchInText(
  content: string,
  options: SearchOptions,
  target: SearchTargetInfo
): { matches: SearchMatch[]; error?: string } {
  const { regex, error } = compileSearchPattern(options);
  if (error || !regex) {
    return { matches: [], error };
  }

  const matches: SearchMatch[] = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineContent = lines[lineIndex];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineContent)) !== null) {
      const matchText = match[0];
      if (matchText.length === 0) {
        // Prevent infinite loops on zero-length matches
        regex.lastIndex += 1;
        continue;
      }

      const column = match.index + 1;
      const preview = createSnippetPreview(lineContent, match.index, matchText.length);

      matches.push({
        packageId: target.packageId,
        packageName: target.packageName,
        chapterId: target.chapterId,
        chapterTitle: target.chapterTitle,
        chapterFile: target.chapterFile,
        line: lineIndex + 1,
        column,
        length: matchText.length,
        matchText,
        lineContent,
        preview
      });

      if (!regex.global) break;
    }
  }

  return { matches };
}

function applyCasing(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (original === original.toLowerCase() && original !== original.toUpperCase()) {
    return replacement.toLowerCase();
  }
  const isTitleCase =
    original.length > 0 &&
    original[0] === original[0].toUpperCase() &&
    original.slice(1) === original.slice(1).toLowerCase();
  if (isTitleCase && replacement.length > 0) {
    return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

export function replaceInText(source: string, options: ReplaceOptions): ReplaceResult {
  const { regex, error } = compileSearchPattern(options);
  if (error || !regex) {
    return { newContent: source, replacementsCount: 0, error };
  }

  let replacementsCount = 0;
  const newContent = source.replace(regex, (match) => {
    replacementsCount += 1;
    if (options.preserveCase) {
      return applyCasing(match, options.replaceWith);
    }
    return options.replaceWith;
  });

  return { newContent, replacementsCount };
}

export async function searchPackage(
  packageDir: string,
  manifest: PackageManifest,
  options: SearchOptions
): Promise<SearchResult> {
  const normalizedPackageDir = path.resolve(packageDir);
  const matches: SearchMatch[] = [];
  let searchedChapters = 0;
  let skippedChapters = 0;
  const warnings: string[] = [];

  const { regex, error: compileError } = compileSearchPattern(options);
  if (compileError || !regex) {
    return {
      matches: [],
      totalMatches: 0,
      searchedChapters: 0,
      searchedPackages: 1,
      skippedChapters: 0,
      skippedPackages: 0,
      warnings: [],
      error: compileError
    };
  }

  const chaptersDir = path.join(normalizedPackageDir, 'chapters');
  for (const chapter of manifest.chapters) {
    if (!isValidChapterPath(normalizedPackageDir, chapter.file)) {
      skippedChapters += 1;
      warnings.push(`跳过章节「${chapter.title}」：章节路径不安全或无效。`);
      continue;
    }

    const chapterPath = await resolveSafeExistingPath(
      chaptersDir,
      chapter.file,
      normalizedPackageDir
    );
    if (!chapterPath) {
      skippedChapters += 1;
      warnings.push(`跳过章节「${chapter.title}」：文件不存在或无法安全读取。`);
      continue;
    }

    try {
      const content = await fs.readFile(chapterPath, 'utf8');
      searchedChapters += 1;
      const result = searchInText(content, options, {
        packageId: manifest.id,
        packageName: manifest.name,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterFile: chapter.file
      });
      matches.push(...result.matches);
    } catch (cause) {
      skippedChapters += 1;
      warnings.push(
        `跳过章节「${chapter.title}」：${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
  }

  return {
    matches,
    totalMatches: matches.length,
    searchedChapters,
    searchedPackages: 1,
    skippedChapters,
    skippedPackages: 0,
    warnings
  };
}

export async function searchWorkspace(
  workspacePackages: Array<{ dir: string; manifest?: PackageManifest } | RegisteredPackage>,
  options: SearchOptions
): Promise<SearchResult> {
  const matches: SearchMatch[] = [];
  let searchedChapters = 0;
  let searchedPackages = 0;
  let skippedChapters = 0;
  let skippedPackages = 0;
  const warnings: string[] = [];

  const { error: compileError } = compileSearchPattern(options);
  if (compileError) {
    return {
      matches: [],
      totalMatches: 0,
      searchedChapters: 0,
      searchedPackages: 0,
      skippedChapters: 0,
      skippedPackages: 0,
      warnings: [],
      error: compileError
    };
  }

  for (const pkg of workspacePackages) {
    const pkgDir = 'path' in pkg ? pkg.path : pkg.dir;
    let manifest: PackageManifest | undefined = 'manifest' in pkg ? pkg.manifest : undefined;

    if (!manifest) {
      const loaded = await loadPackageManifest(pkgDir);
      if (!loaded.ok) {
        skippedPackages += 1;
        warnings.push(`跳过实验包「${pkgDir}」：${loaded.error.message}`);
        continue;
      }
      manifest = loaded.value;
    }

    const packageResult = await searchPackage(pkgDir, manifest, options);
    searchedPackages += 1;
    searchedChapters += packageResult.searchedChapters;
    skippedChapters += packageResult.skippedChapters;
    warnings.push(...packageResult.warnings);
    matches.push(...packageResult.matches);
  }

  return {
    matches,
    totalMatches: matches.length,
    searchedChapters,
    searchedPackages,
    skippedChapters,
    skippedPackages,
    warnings
  };
}
