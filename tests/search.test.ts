import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compileSearchPattern,
  replaceInText,
  searchInText,
  searchPackage,
  searchWorkspace
} from '../packages/core/src/search';
import type { PackageManifest, RegisteredPackage } from '@learnlab/core-types';

const tempDirs: string[] = [];

async function createFixturePackage(manifestYaml: string, chapters: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-search-test-'));
  tempDirs.push(dir);
  await writeFile(path.join(dir, 'manifest.yaml'), manifestYaml, 'utf8');
  await mkdir(path.join(dir, 'chapters'), { recursive: true });
  for (const [filename, content] of Object.entries(chapters)) {
    await writeFile(path.join(dir, 'chapters', filename), content, 'utf8');
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('search module', () => {
  const sampleText = `# SQL Tutorial
SELECT * FROM users;
Select id, name From accounts Where active = 1;
-- Note: select all items
SELECT * FROM orders;
`;

  it('performs case-insensitive search by default', () => {
    const result = searchInText(sampleText, { query: 'select' }, {
      packageId: 'sql',
      packageName: 'SQL Intro',
      chapterId: 'ch1',
      chapterTitle: 'Select Basics',
      chapterFile: '01.md'
    });

    expect(result.error).toBeUndefined();
    expect(result.matches.length).toBe(4);
    expect(result.matches[0].line).toBe(2);
    expect(result.matches[0].column).toBe(1);
    expect(result.matches[0].matchText).toBe('SELECT');
    expect(result.matches[1].line).toBe(3);
    expect(result.matches[1].matchText).toBe('Select');
  });

  it('performs case-sensitive search when enabled', () => {
    const result = searchInText(sampleText, { query: 'SELECT', caseSensitive: true }, {
      packageId: 'sql',
      packageName: 'SQL Intro',
      chapterId: 'ch1',
      chapterTitle: 'Select Basics',
      chapterFile: '01.md'
    });

    expect(result.error).toBeUndefined();
    expect(result.matches.length).toBe(2);
    expect(result.matches.every((m) => m.matchText === 'SELECT')).toBe(true);
  });

  it('supports whole-word matching', () => {
    const text = 'cat catch cats bobcat cat.';
    const result = searchInText(text, { query: 'cat', wholeWord: true }, {
      packageId: 'test',
      packageName: 'Test',
      chapterId: 'ch1',
      chapterTitle: 'Ch1',
      chapterFile: 'ch1.md'
    });

    expect(result.error).toBeUndefined();
    expect(result.matches.length).toBe(2);
    expect(result.matches[0].column).toBe(1);
    expect(result.matches[1].column).toBe(23);
  });

  it('supports regular expressions', () => {
    const result = searchInText(sampleText, { query: 'SELECT\\s+\\*\\s+FROM\\s+\\w+', isRegex: true }, {
      packageId: 'sql',
      packageName: 'SQL Intro',
      chapterId: 'ch1',
      chapterTitle: 'Select Basics',
      chapterFile: '01.md'
    });

    expect(result.error).toBeUndefined();
    expect(result.matches.length).toBe(2);
    expect(result.matches[0].matchText).toBe('SELECT * FROM users');
    expect(result.matches[1].matchText).toBe('SELECT * FROM orders');
  });

  it('gracefully handles invalid regular expressions without throwing', () => {
    const result = searchInText(sampleText, { query: '([unclosed', isRegex: true }, {
      packageId: 'sql',
      packageName: 'SQL Intro',
      chapterId: 'ch1',
      chapterTitle: 'Select Basics',
      chapterFile: '01.md'
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Invalid regular expression');
    expect(result.matches.length).toBe(0);
  });

  it('protects against ReDoS / catastrophic backtracking patterns and excessive regex lengths', () => {
    const redosQuery = '(a+)+';
    const compiled = compileSearchPattern({ query: redosQuery, isRegex: true });
    expect(compiled.error).toContain('unsafe nested quantifiers');
    expect(compiled.regex).toBeUndefined();

    const redosCurly = '(a+){2,}';
    const compiledCurly = compileSearchPattern({ query: redosCurly, isRegex: true });
    expect(compiledCurly.error).toContain('unsafe nested quantifiers');

    // Literal escaped parentheses should not be falsely rejected
    const safeEscaped = '\\(\\d+\\)+';
    const compiledSafe = compileSearchPattern({ query: safeEscaped, isRegex: true });
    expect(compiledSafe.error).toBeUndefined();
    expect(compiledSafe.regex).toBeDefined();

    const longQuery = 'a'.repeat(350);
    const compiledLong = compileSearchPattern({ query: longQuery, isRegex: true });
    expect(compiledLong.error).toContain('too long');
  });

  it('extracts context preview snippets around match', () => {
    const line = 'A very long prefix of words that goes on and on before we hit the TARGET_WORD and then more suffix text follows';
    const result = searchInText(line, { query: 'TARGET_WORD' }, {
      packageId: 'test',
      packageName: 'Test',
      chapterId: 'ch1',
      chapterTitle: 'Ch1',
      chapterFile: 'ch1.md'
    });

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].preview).toContain('TARGET_WORD');
    expect(result.matches[0].preview.startsWith('...')).toBe(true);
    expect(result.matches[0].preview.endsWith('...')).toBe(true);
  });

  it('searches across chapters in a package', async () => {
    const pkgDir = await createFixturePackage(
      `id: "test.pkg"
version: "1.0.0"
name: "Test Package"
author: "Author"
chapters:
  - id: "ch1"
    title: "Chapter One"
    file: "01.md"
  - id: "ch2"
    title: "Chapter Two"
    file: "02.md"
`,
      {
        '01.md': '# One\nLearn about algorithms and sorting.',
        '02.md': '# Two\nSorting algorithms are essential.'
      }
    );

    const manifest: PackageManifest = {
      id: 'test.pkg',
      version: '1.0.0',
      name: 'Test Package',
      author: 'Author',
      chapters: [
        { id: 'ch1', title: 'Chapter One', file: '01.md' },
        { id: 'ch2', title: 'Chapter Two', file: '02.md' }
      ]
    };

    const res = await searchPackage(pkgDir, manifest, { query: 'sorting' });
    expect(res.error).toBeUndefined();
    expect(res.totalMatches).toBe(2);
    expect(res.matches.map((m) => m.chapterId)).toEqual(['ch1', 'ch2']);
  });

  it('searches across registered packages in a workspace', async () => {
    const pkg1 = await createFixturePackage(
      `id: "pkg1"
version: "1.0.0"
name: "Package 1"
author: "Author"
chapters:
  - id: "c1"
    title: "Intro"
    file: "c1.md"
`,
      { 'c1.md': 'Database indexing fundamentals' }
    );

    const pkg2 = await createFixturePackage(
      `id: "pkg2"
version: "1.0.0"
name: "Package 2"
author: "Author"
chapters:
  - id: "c2"
    title: "Advanced"
    file: "c2.md"
`,
      { 'c2.md': 'B-Tree indexing in modern engines' }
    );

    const registered: RegisteredPackage[] = [
      { id: 'pkg1', name: 'Package 1', version: '1.0.0', path: pkg1, isSymlink: false, registeredAt: '' },
      { id: 'pkg2', name: 'Package 2', version: '1.0.0', path: pkg2, isSymlink: false, registeredAt: '' }
    ];

    const result = await searchWorkspace(registered, { query: 'indexing' });
    expect(result.searchedPackages).toBe(2);
    expect(result.totalMatches).toBe(2);
    expect(result.matches[0].packageId).toBe('pkg1');
    expect(result.matches[1].packageId).toBe('pkg2');
  });

  it('reports chapters that could not be searched', async () => {
    const pkgDir = await createFixturePackage(
      `id: "test.pkg"
version: "1.0.0"
name: "Test Package"
author: "Author"
chapters:
  - id: "present"
    title: "Present"
    file: "present.md"
  - id: "missing"
    title: "Missing"
    file: "missing.md"
`,
      { 'present.md': 'visible content' }
    );
    const manifest: PackageManifest = {
      id: 'test.pkg',
      version: '1.0.0',
      name: 'Test Package',
      author: 'Author',
      chapters: [
        { id: 'present', title: 'Present', file: 'present.md' },
        { id: 'missing', title: 'Missing', file: 'missing.md' }
      ]
    };

    const result = await searchPackage(pkgDir, manifest, { query: 'visible' });

    expect(result.totalMatches).toBe(1);
    expect(result.searchedChapters).toBe(1);
    expect(result.skippedChapters).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('reports packages whose manifests cannot be loaded during workspace search', async () => {
    const result = await searchWorkspace(
      [{ dir: path.join(tmpdir(), 'learnlab-search-package-does-not-exist') }],
      { query: 'anything' }
    );

    expect(result.searchedPackages).toBe(0);
    expect(result.skippedPackages).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('continues workspace search when one declared chapter is unavailable', async () => {
    const pkgDir = await createFixturePackage(
      `id: "test.workspace-search"
version: "1.0.0"
name: "Workspace Search Package"
author: "Author"
chapters:
  - id: "present"
    title: "Present"
    file: "present.md"
  - id: "missing"
    title: "Missing"
    file: "missing.md"
`,
      { 'present.md': 'searchable workspace content' }
    );

    const result = await searchWorkspace([{ dir: pkgDir }], { query: 'searchable' });

    expect(result.searchedPackages).toBe(1);
    expect(result.totalMatches).toBe(1);
    expect(result.searchedChapters).toBe(1);
    expect(result.skippedChapters).toBe(1);
    expect(result.skippedPackages).toBe(0);
  });

  it('replaces text with optional case preservation', () => {
    const text = 'apple Apple APPLE';
    const resNoPreserve = replaceInText(text, {
      query: 'apple',
      replaceWith: 'orange',
      preserveCase: false
    });
    expect(resNoPreserve.newContent).toBe('orange orange orange');
    expect(resNoPreserve.replacementsCount).toBe(3);

    const resPreserve = replaceInText(text, {
      query: 'apple',
      replaceWith: 'orange',
      preserveCase: true
    });
    expect(resPreserve.newContent).toBe('orange Orange ORANGE');
  });
});
