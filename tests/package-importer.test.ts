import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importPackageIntoWorkspace, WorkspaceManager } from '../packages/core/src';

async function createPackage(dir: string, id: string, name: string): Promise<void> {
  await mkdir(path.join(dir, 'chapters'), { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.yaml'),
    `id: ${id}\nversion: 1.0.0\nname: ${name}\nauthor: LearnLab\nchapters:\n  - id: ch1\n    title: Chapter 1\n    file: ch1.md\n`
  );
  await writeFile(path.join(dir, 'chapters', 'ch1.md'), '# Chapter 1\nHello');
}

async function withTempRoot(run: (root: string, workspaceDir: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'learnlab-import-'));
  try {
    await run(root, path.join(root, 'workspace'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('importPackageIntoWorkspace', () => {
  it('copies an outside package into the workspace and registers the copy', async () => {
    await withTempRoot(async (root, workspaceDir) => {
      const source = path.join(root, 'downloads', 'sql-intro');
      await createPackage(source, 'com.example.sql-intro', 'SQL Intro');
      await writeFile(path.join(source, 'package.db'), '{"secret":"progress"}');
      await mkdir(path.join(source, 'experiment_history'), { recursive: true });
      await writeFile(path.join(source, 'experiment_history', 'a.json'), '{}');
      await symlink(path.join(root), path.join(source, 'escape-link'));

      const result = await importPackageIntoWorkspace(workspaceDir, source);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const installed = result.value.path;
      expect(await realpath(path.dirname(installed))).toBe(await realpath(workspaceDir));
      expect(await readFile(path.join(installed, 'chapters', 'ch1.md'), 'utf8')).toContain('Hello');
      const entries = await readdir(installed);
      expect(entries).not.toContain('package.db');
      expect(entries).not.toContain('experiment_history');
      expect(entries).not.toContain('escape-link');

      // The source folder is left exactly as it was.
      expect(await readFile(path.join(source, 'package.db'), 'utf8')).toContain('progress');
      expect((await WorkspaceManager.listPackages(workspaceDir)).map((p) => p.id)).toEqual(['com.example.sql-intro']);
      expect((await readdir(workspaceDir)).filter((name) => name.startsWith('.import-'))).toEqual([]);
    });
  });

  it('registers a real directory that is already inside the workspace without copying', async () => {
    await withTempRoot(async (_root, workspaceDir) => {
      const inside = path.join(workspaceDir, 'already-here');
      await createPackage(inside, 'org.inside', 'Inside');

      const result = await importPackageIntoWorkspace(workspaceDir, inside);
      expect(result.ok).toBe(true);
      expect((await readdir(workspaceDir)).filter((name) => name !== 'dependencies' && !name.startsWith('workspace.')))
        .toEqual(['already-here']);
    });
  });

  it('rejects invalid packages and leaves no partial directory behind', async () => {
    await withTempRoot(async (root, workspaceDir) => {
      const source = path.join(root, 'broken');
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'manifest.yaml'), 'id: only-an-id\n');

      const result = await importPackageIntoWorkspace(workspaceDir, source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('manifest_invalid');
      expect((await readdir(workspaceDir)).filter((name) => name.startsWith('.import-') || name === 'only-an-id')).toEqual([]);
    });
  });

  it('refuses a duplicate import and keeps the first copy intact', async () => {
    await withTempRoot(async (root, workspaceDir) => {
      const source = path.join(root, 'src');
      await createPackage(source, 'org.dup', 'Dup');

      expect((await importPackageIntoWorkspace(workspaceDir, source)).ok).toBe(true);
      const second = await importPackageIntoWorkspace(workspaceDir, source);
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.type).toBe('package_already_registered');
      expect((await stat(path.join(workspaceDir, 'org.dup', 'manifest.yaml'))).isFile()).toBe(true);
      expect((await readdir(workspaceDir)).filter((name) => name.startsWith('.import-'))).toEqual([]);
    });
  });

  it('rejects a source that contains the workspace', async () => {
    await withTempRoot(async (root, workspaceDir) => {
      await createPackage(root, 'org.parent', 'Parent');
      const result = await importPackageIntoWorkspace(workspaceDir, root);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('outside_workspace');
    });
  });
});
