import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPackage, readChapter } from '../packages/core/src/package-loader';

const temporaryDirectories: string[] = [];

async function createPackage(manifest: string, chapter = '# Chapter') {
  const root = await mkdtemp(join(tmpdir(), 'learnlab-package-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'chapters'));
  await writeFile(join(root, 'manifest.yaml'), manifest, 'utf8');
  await writeFile(join(root, 'chapters', '01.md'), chapter, 'utf8');
  return root;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('package loader', () => {
  it('loads a valid package and reads a chapter through the core API', async () => {
    const root = await createPackage(`
      id: "com.example.course"
      version: "1.0.0"
      name: "Course"
      author: "Author"
      chapters:
        - id: "01"
          title: "Intro"
          file: 01.md
    `);

    const loaded = await loadPackage(root);
    expect(loaded.ok).toBe(true);

    const chapter = await readChapter(root, '01.md');
    expect(chapter).toEqual({ ok: true, value: '# Chapter' });
  });

  it('rejects a chapter that escapes through a sibling directory', async () => {
    const root = await createPackage(`
      id: "com.example.course"
      version: "1.0.0"
      name: "Course"
      author: "Author"
      chapters:
        - id: "01"
          title: "Secret"
          file: ../chapters-evil/secret.md
    `);
    await mkdir(join(root, 'chapters-evil'));
    await writeFile(join(root, 'chapters-evil', 'secret.md'), 'secret', 'utf8');

    const loaded = await loadPackage(root);
    expect(loaded).toMatchObject({ ok: false, error: { type: 'chapter_invalid_path' } });
  });

  it('rejects a chapter symlink that points outside the package', async () => {
    const root = await createPackage(`
      id: "com.example.course"
      version: "1.0.0"
      name: "Course"
      author: "Author"
      chapters:
        - id: "01"
          title: "Secret"
          file: outside.md
    `);
    const outside = join(root, 'outside.md');
    await writeFile(outside, 'secret', 'utf8');
    await symlink(outside, join(root, 'chapters', 'outside.md'));

    const loaded = await loadPackage(root);
    expect(loaded).toMatchObject({ ok: false, error: { type: 'chapter_invalid_path' } });
    await readFile(outside, 'utf8');
  });


  it('rejects a chapters directory symlink that points outside the package', async () => {
    const root = await createPackage(`
      id: "com.example.course"
      version: "1.0.0"
      name: "Course"
      author: "Author"
      chapters:
        - id: "01"
          title: "Secret"
          file: "secret.md"
    `);
    const externalRoot = await mkdtemp(join(tmpdir(), 'learnlab-external-'));
    temporaryDirectories.push(externalRoot);
    const externalDir = join(externalRoot, 'chapters');
    await mkdir(externalDir);
    await writeFile(join(externalDir, 'secret.md'), 'secret', 'utf8');
    const chaptersDir = join(root, 'chapters');
    const originalChapter = join(chaptersDir, '01.md');
    const chaptersBackup = join(root, 'chapters-original');
    const { rename } = await import('node:fs/promises');
    await rename(chaptersDir, chaptersBackup);
    await symlink(externalDir, chaptersDir);
    const loaded = await loadPackage(root);
    expect(loaded).toMatchObject({ ok: false, error: { type: 'chapter_invalid_path' } });
    await readFile(originalChapter, 'utf8').catch(() => undefined);
  });

  it('returns a structured error instead of throwing for an unsafe chapter read', async () => {
    const root = await createPackage(`
      id: "com.example.course"
      version: "1.0.0"
      name: "Course"
      author: "Author"
      chapters:
        - id: "01"
          title: "Intro"
          file: 01.md
    `);

    const result = await readChapter(root, '../../etc/passwd');
    expect(result).toMatchObject({ ok: false, error: { type: 'chapter_invalid_path' } });
  });
});
