import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateBufferSha256, createTarGz, WorkspaceManager } from '../packages/core/src';
import { validatePackageDirectory } from '../tools/labkit/src';

describe('workspace-manager and package registry', () => {
  it('uses workspace.db as the authoritative registry and creates it in portable mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-authoritative-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      await WorkspaceManager.initWorkspace(workspaceDir);
      expect((await import('node:fs/promises')).stat(path.join(workspaceDir, 'workspace.db'))).resolves.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('initializes workspace directory structure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-init-'));
    try {
      const workspaceDir = path.join(root, 'my-workspace');
      const paths = await WorkspaceManager.initWorkspace(workspaceDir);

      expect(paths.workspaceDir).toBe(path.resolve(workspaceDir));
      expect(paths.dependenciesDir).toBe(path.join(path.resolve(workspaceDir), 'dependencies'));

      const state = await readFile(path.join(workspaceDir, 'workspace.json'), 'utf8');
      expect(JSON.parse(state).version).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers package and rejects duplicate package ID with conflict path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-pkg-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const pkgDir1 = path.join(root, 'pkg1');
      await mkdir(path.join(pkgDir1, 'chapters'), { recursive: true });
      await writeFile(
        path.join(pkgDir1, 'manifest.yaml'),
        `id: demo.pkg\nversion: 1.0.0\nname: Demo Package\nauthor: LearnLab\nchapters:\n  - id: ch1\n    title: Chapter 1\n    file: ch1.md\n`
      );
      await writeFile(path.join(pkgDir1, 'chapters', 'ch1.md'), '# Chapter 1\nHello');

      // Register pkg1
      const res1 = await WorkspaceManager.registerPackage(workspaceDir, pkgDir1);
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.value.id).toBe('demo.pkg');
        expect(res1.value.name).toBe('Demo Package');
        expect(res1.value.isSymlink).toBe(false);
      }

      // Try registering pkg2 with same ID
      const pkgDir2 = path.join(root, 'pkg2');
      await mkdir(path.join(pkgDir2, 'chapters'), { recursive: true });
      await writeFile(
        path.join(pkgDir2, 'manifest.yaml'),
        `id: demo.pkg\nversion: 2.0.0\nname: Demo 2\nauthor: Other\nchapters:\n  - id: ch1\n    title: Ch 1\n    file: ch1.md\n`
      );
      await writeFile(path.join(pkgDir2, 'chapters', 'ch1.md'), '# Chapter 1\nDifferent');

      const res2 = await WorkspaceManager.registerPackage(workspaceDir, pkgDir2);
      expect(res2.ok).toBe(false);
      if (!res2.ok) {
        expect(res2.error.type).toBe('package_already_registered');
        expect(res2.error.conflictPath).toBe(path.resolve(pkgDir1));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers symlinked package and unregistering does not delete target', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-sym-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const realPkgDir = path.join(root, 'real-pkg');
      await mkdir(path.join(realPkgDir, 'chapters'), { recursive: true });
      await writeFile(
        path.join(realPkgDir, 'manifest.yaml'),
        `id: sym.pkg\nversion: 1.0.0\nname: Symlink Package\nauthor: LearnLab\nchapters:\n  - id: ch1\n    title: Ch1\n    file: ch1.md\n`
      );
      await writeFile(path.join(realPkgDir, 'chapters', 'ch1.md'), '# Ch1');

      const linkPkgDir = path.join(root, 'link-pkg');
      await symlink(realPkgDir, linkPkgDir);

      const regResult = await WorkspaceManager.registerPackage(workspaceDir, linkPkgDir);
      expect(regResult.ok).toBe(true);
      if (regResult.ok) {
        expect(regResult.value.isSymlink).toBe(true);
        expect(regResult.value.targetPath).toBe(
          await (await import('node:fs/promises')).realpath(realPkgDir)
        );
      }

      // Unregister package
      const unreg = await WorkspaceManager.unregisterPackage(workspaceDir, 'sym.pkg');
      expect(unreg).toBe(true);

      const packages = await WorkspaceManager.listPackages(workspaceDir);
      expect(packages.find((p) => p.id === 'sym.pkg')).toBeUndefined();

      // Ensure real target directory is intact!
      const manifestStillExists = await readFile(path.join(realPkgDir, 'manifest.yaml'), 'utf8');
      expect(manifestStillExists).toContain('id: sym.pkg');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('shares dependency across multiple packages in workspace and tracks external prerequisites', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-shared-'));
    try {
      const workspaceDir = path.join(root, 'workspace');

      // Create a bundled dependency tar.gz
      const archiveBuf = createTarGz([{ name: 'tool.sh', data: '#!/bin/sh\necho shared' }]);
      const depSha256 = calculateBufferSha256(archiveBuf);

      // Package A
      const pkgADir = path.join(root, 'pkg-a');
      await mkdir(path.join(pkgADir, 'chapters'), { recursive: true });
      await mkdir(path.join(pkgADir, 'bundled-dependencies'), { recursive: true });
      await writeFile(path.join(pkgADir, 'bundled-dependencies', 'tool.tar.gz'), archiveBuf);
      await writeFile(
        path.join(pkgADir, 'manifest.yaml'),
        `id: org.pkg.a\nversion: 1.0.0\nname: Package A\nauthor: Author\nchapters:\n  - id: ch1\n    title: Ch1\n    file: ch1.md\nruntime_dependencies:\n  - id: shared.tool\n    version: 1.0.0\n    provider: plugin.test\n    source: bundled\n    bundled_artifact:\n      path: bundled-dependencies/tool.tar.gz\n      sha256: ${depSha256}\n      size: ${archiveBuf.length}\nexternal_prerequisites:\n  - id: system.docker\n    version: ">=20.0.0"\n    required: true\n    reason: "Requires Docker daemon"\n`
      );
      await writeFile(path.join(pkgADir, 'chapters', 'ch1.md'), '# Ch1');

      // Package B (shares the same dependency tool.tar.gz)
      const pkgBDir = path.join(root, 'pkg-b');
      await mkdir(path.join(pkgBDir, 'chapters'), { recursive: true });
      await mkdir(path.join(pkgBDir, 'bundled-dependencies'), { recursive: true });
      await writeFile(path.join(pkgBDir, 'bundled-dependencies', 'tool.tar.gz'), archiveBuf);
      await writeFile(
        path.join(pkgBDir, 'manifest.yaml'),
        `id: org.pkg.b\nversion: 1.0.0\nname: Package B\nauthor: Author\nchapters:\n  - id: ch1\n    title: Ch1\n    file: ch1.md\nruntime_dependencies:\n  - id: shared.tool\n    version: 1.0.0\n    provider: plugin.test\n    source: bundled\n    bundled_artifact:\n      path: bundled-dependencies/tool.tar.gz\n      sha256: ${depSha256}\n      size: ${archiveBuf.length}\n`
      );
      await writeFile(path.join(pkgBDir, 'chapters', 'ch1.md'), '# Ch1');

      // Register both packages
      await WorkspaceManager.registerPackage(workspaceDir, pkgADir);
      await WorkspaceManager.registerPackage(workspaceDir, pkgBDir);

      // Verify external prerequisites are recorded as declarations only
      const prereqs = await WorkspaceManager.getWorkspacePrerequisites(workspaceDir);
      expect(prereqs.length).toBe(1);
      expect(prereqs[0].prerequisiteId).toBe('system.docker');
      expect(prereqs[0].required).toBe(true);

      // Import bundled dependency for package A
      const importA = await WorkspaceManager.importBundledDependency(
        workspaceDir,
        'org.pkg.a',
        'shared.tool'
      );
      expect(importA.ok).toBe(true);
      if (importA.ok) {
        expect(importA.value.reused).toBe(false);
      }

      // Import bundled dependency for package B (should reuse existing!)
      const importB = await WorkspaceManager.importBundledDependency(
        workspaceDir,
        'org.pkg.b',
        'shared.tool'
      );
      expect(importB.ok).toBe(true);
      if (importB.ok) {
        expect(importB.value.reused).toBe(true);
      }

      // Only ONE shared dependency entry exists in workspace dependencies
      const deps = await WorkspaceManager.getWorkspaceDependencies(workspaceDir);
      expect(deps.length).toBe(1);
      expect(deps[0].dependencyId).toBe('shared.tool');
      expect(deps[0].status).toBe('installed');

      // Validate package A with LabKit
      const labkitReport = await validatePackageDirectory(pkgADir);
      expect(labkitReport.ok).toBe(true);
      if (labkitReport.ok) {
        const depChecks = labkitReport.value.dependencyChecks;
        expect(depChecks.some((c) => c.id === 'shared.tool' && c.status === 'valid')).toBe(true);
        expect(depChecks.some((c) => c.id === 'system.docker' && c.type === 'prerequisite')).toBe(
          true
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves a corrupt legacy workspace state instead of silently resetting it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-corrupt-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      await mkdir(workspaceDir, { recursive: true });
      const stateFile = path.join(workspaceDir, 'workspace.json');
      const corruptState = '{ not valid json';
      await writeFile(stateFile, corruptState);

      await expect(WorkspaceManager.initWorkspace(workspaceDir)).rejects.toThrow(
        'Workspace state is invalid JSON'
      );
      expect(await readFile(stateFile, 'utf8')).toBe(corruptState);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores stale legacy workspace.json once workspace.db exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-legacy-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      await WorkspaceManager.initWorkspace(workspaceDir);
      const stateFile = path.join(workspaceDir, 'workspace.json');
      await writeFile(stateFile, '{ not valid json');

      await expect(WorkspaceManager.initWorkspace(workspaceDir)).resolves.toBeDefined();
      expect(await readFile(stateFile, 'utf8')).toBe('{ not valid json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects registering the same physical package directory under a changed ID', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-path-conflict-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const packageDir = path.join(root, 'package');
      await mkdir(path.join(packageDir, 'chapters'), { recursive: true });
      const manifest = (id: string, name: string) =>
        `id: ${id}\nversion: 1.0.0\nname: ${name}\nauthor: Author\nchapters:\n  - id: ch1\n    title: Chapter 1\n    file: ch1.md\n`;
      await writeFile(path.join(packageDir, 'manifest.yaml'), manifest('org.first', 'First'));
      await writeFile(path.join(packageDir, 'chapters', 'ch1.md'), '# Chapter 1');

      expect((await WorkspaceManager.registerPackage(workspaceDir, packageDir)).ok).toBe(true);
      await writeFile(path.join(packageDir, 'manifest.yaml'), manifest('org.second', 'Second'));
      const result = await WorkspaceManager.registerPackage(workspaceDir, packageDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('path_conflict');
        expect(result.error.conflictPath).toBe(path.resolve(packageDir));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects bundled artifacts that escape a package during LabKit validation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-labkit-escape-'));
    try {
      const packageDir = path.join(root, 'package');
      await mkdir(path.join(packageDir, 'chapters'), { recursive: true });
      const archiveBuffer = createTarGz([{ name: 'payload.txt', data: 'content' }]);
      const archivePath = path.join(root, 'outside.tar.gz');
      await writeFile(archivePath, archiveBuffer);
      await writeFile(path.join(packageDir, 'chapters', 'ch1.md'), '# Chapter 1');
      await writeFile(
        path.join(packageDir, 'manifest.yaml'),
        `id: org.escape\nversion: 1.0.0\nname: Escape\nauthor: Author\nchapters:\n  - id: ch1\n    title: Chapter 1\n    file: ch1.md\nruntime_dependencies:\n  - id: org.tool\n    version: 1.0.0\n    provider: test\n    source: bundled\n    bundled_artifact:\n      path: bundled-dependencies/../../outside.tar.gz\n      sha256: ${calculateBufferSha256(archiveBuffer)}\n      size: ${archiveBuffer.length}\n`
      );

      const result = await validatePackageDirectory(packageDir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('chapter_invalid_path');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
