import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateBufferSha256,
  createTarGz,
  importBundledDependency,
  getDependencyInstallPath
} from '../packages/core/src';
import type { DependencyMetadata } from '@learnlab/core-types';

describe('dependency-importer', () => {
  it('imports valid bundled tar.gz dependency and extracts files safely', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-test-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([
        { name: 'bin/runner.sh', data: '#!/bin/sh\necho ok' },
        { name: 'lib/util.txt', data: 'some-library-data' }
      ]);
      const sha256 = calculateBufferSha256(archiveBuffer);
      const archivePath = path.join(root, 'pkg-runtime.tar.gz');
      await writeFile(archivePath, archiveBuffer);

      const metadata: DependencyMetadata = {
        id: 'org.learnlab.sqlite',
        version: '3.45.0',
        platform: 'darwin',
        arch: 'arm64',
        archive: {
          file: 'pkg-runtime.tar.gz',
          sha256,
          size: archiveBuffer.length
        }
      };

      const result = await importBundledDependency({
        workspaceDir,
        archivePath,
        metadata
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reused).toBe(false);
        const expectedPath = getDependencyInstallPath(workspaceDir, metadata);
        expect(result.value.installPath).toBe(expectedPath);

        const runnerContent = await readFile(path.join(expectedPath, 'bin/runner.sh'), 'utf8');
        expect(runnerContent).toBe('#!/bin/sh\necho ok');
        const libContent = await readFile(path.join(expectedPath, 'lib/util.txt'), 'utf8');
        expect(libContent).toBe('some-library-data');
      }

      // Deduplication test: re-importing identical dependency returns reused: true
      const secondResult = await importBundledDependency({
        workspaceDir,
        archivePath,
        metadata
      });
      expect(secondResult.ok).toBe(true);
      if (secondResult.ok) {
        expect(secondResult.value.reused).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows different SHA-256 variants of same dependency to coexist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-coexist-'));
    try {
      const workspaceDir = path.join(root, 'workspace');

      // Variant 1
      const buf1 = createTarGz([{ name: 'file.txt', data: 'v1' }]);
      const sha1 = calculateBufferSha256(buf1);
      const arc1 = path.join(root, 'v1.tar.gz');
      await writeFile(arc1, buf1);

      const meta1: DependencyMetadata = {
        id: 'org.learnlab.tool',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: { file: 'v1.tar.gz', sha256: sha1, size: buf1.length }
      };

      // Variant 2
      const buf2 = createTarGz([{ name: 'file.txt', data: 'v2' }]);
      const sha2 = calculateBufferSha256(buf2);
      const arc2 = path.join(root, 'v2.tar.gz');
      await writeFile(arc2, buf2);

      const meta2: DependencyMetadata = {
        id: 'org.learnlab.tool',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: { file: 'v2.tar.gz', sha256: sha2, size: buf2.length }
      };

      const res1 = await importBundledDependency({
        workspaceDir,
        archivePath: arc1,
        metadata: meta1
      });
      const res2 = await importBundledDependency({
        workspaceDir,
        archivePath: arc2,
        metadata: meta2
      });

      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      if (res1.ok && res2.ok) {
        expect(res1.value.installPath).not.toBe(res2.value.installPath);
        const f1 = await readFile(path.join(res1.value.installPath, 'file.txt'), 'utf8');
        const f2 = await readFile(path.join(res2.value.installPath, 'file.txt'), 'utf8');
        expect(f1).toBe('v1');
        expect(f2).toBe('v2');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects SHA-256 mismatch and leaves no partial files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-hash-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([{ name: 'payload.txt', data: 'secret' }]);
      const archivePath = path.join(root, 'payload.tar.gz');
      await writeFile(archivePath, archiveBuffer);

      const metadata: DependencyMetadata = {
        id: 'org.learnlab.tool',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'payload.tar.gz',
          sha256: 'f'.repeat(64), // wrong hash
          size: archiveBuffer.length
        }
      };

      const result = await importBundledDependency({
        workspaceDir,
        archivePath,
        metadata
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('hash_mismatch');
      }

      const installPath = getDependencyInstallPath(workspaceDir, metadata);
      await expect(stat(installPath)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects size mismatch and leaves no partial files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-size-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([{ name: 'payload.txt', data: 'content' }]);
      const sha256 = calculateBufferSha256(archiveBuffer);
      const archivePath = path.join(root, 'payload.tar.gz');
      await writeFile(archivePath, archiveBuffer);

      const metadata: DependencyMetadata = {
        id: 'org.learnlab.tool',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'payload.tar.gz',
          sha256,
          size: archiveBuffer.length + 100 // wrong size
        }
      };

      const result = await importBundledDependency({
        workspaceDir,
        archivePath,
        metadata
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('size_mismatch');
      }

      const installPath = getDependencyInstallPath(workspaceDir, metadata);
      await expect(stat(installPath)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects path traversal attacks inside tar archive', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-traversal-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([
        { name: '../escape.sh', data: 'malicious' },
        { name: 'valid.txt', data: 'ok' }
      ]);
      const sha256 = calculateBufferSha256(archiveBuffer);
      const archivePath = path.join(root, 'attack.tar.gz');
      await writeFile(archivePath, archiveBuffer);

      const metadata: DependencyMetadata = {
        id: 'org.learnlab.attack',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'attack.tar.gz',
          sha256,
          size: archiveBuffer.length
        }
      };

      const result = await importBundledDependency({
        workspaceDir,
        archivePath,
        metadata
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('path_traversal');
      }

      // Ensure no files leaked
      const installPath = getDependencyInstallPath(workspaceDir, metadata);
      await expect(stat(installPath)).rejects.toThrow();
      await expect(stat(path.join(root, 'escape.sh'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects symlink escape attacks inside tar archive', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-symlink-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([
        { name: 'bad_link', type: '2', linkname: '../../../../etc/passwd' }
      ]);
      const sha256 = calculateBufferSha256(archiveBuffer);
      const archivePath = path.join(root, 'symlink-attack.tar.gz');
      await writeFile(archivePath, archiveBuffer);

      const metadata: DependencyMetadata = {
        id: 'org.learnlab.symlink',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'symlink-attack.tar.gz',
          sha256,
          size: archiveBuffer.length
        }
      };

      const result = await importBundledDependency({
        workspaceDir,
        archivePath,
        metadata
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('symlink_escape');
      }

      const installPath = getDependencyInstallPath(workspaceDir, metadata);
      await expect(stat(installPath)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns file_not_found error for missing archive', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-missing-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const metadata: DependencyMetadata = {
        id: 'org.learnlab.missing',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: { file: 'none.tar.gz', sha256: 'a'.repeat(64), size: 10 }
      };

      const result = await importBundledDependency({
        workspaceDir,
        archivePath: path.join(root, 'non-existent.tar.gz'),
        metadata
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('file_not_found');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not reuse or delete an existing install after integrity tampering', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-tamper-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([{ name: 'payload.txt', data: 'original' }]);
      const archivePath = path.join(root, 'payload.tar.gz');
      await writeFile(archivePath, archiveBuffer);
      const metadata: DependencyMetadata = {
        id: 'org.learnlab.tamper',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'payload.tar.gz',
          sha256: calculateBufferSha256(archiveBuffer),
          size: archiveBuffer.length
        }
      };

      const first = await importBundledDependency({ workspaceDir, archivePath, metadata });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const payloadPath = path.join(first.value.installPath, 'payload.txt');
      await writeFile(payloadPath, 'tampered');

      const second = await importBundledDependency({ workspaceDir, archivePath, metadata });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.type).toBe('io_error');
      expect(await readFile(payloadPath, 'utf8')).toBe('tampered');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a symlink at the dependency install path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-install-link-'));
    try {
      const workspaceDir = path.join(root, 'workspace');
      const archiveBuffer = createTarGz([{ name: 'payload.txt', data: 'content' }]);
      const archivePath = path.join(root, 'payload.tar.gz');
      await writeFile(archivePath, archiveBuffer);
      const metadata: DependencyMetadata = {
        id: 'org.learnlab.link',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'payload.tar.gz',
          sha256: calculateBufferSha256(archiveBuffer),
          size: archiveBuffer.length
        }
      };
      const installPath = getDependencyInstallPath(workspaceDir, metadata);
      const outside = path.join(root, 'outside');
      await mkdir(outside, { recursive: true });
      await mkdir(path.dirname(installPath), { recursive: true });
      await symlink(outside, installPath);

      const result = await importBundledDependency({ workspaceDir, archivePath, metadata });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('symlink_escape');
      await expect(stat(path.join(outside, 'payload.txt'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an archive source that escapes the package directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-dep-source-escape-'));
    try {
      const packageDir = path.join(root, 'package');
      const archiveBuffer = createTarGz([{ name: 'payload.txt', data: 'content' }]);
      const archivePath = path.join(root, 'outside.tar.gz');
      await writeFile(archivePath, archiveBuffer);
      const metadata: DependencyMetadata = {
        id: 'org.learnlab.source-escape',
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        archive: {
          file: 'outside.tar.gz',
          sha256: calculateBufferSha256(archiveBuffer),
          size: archiveBuffer.length
        }
      };

      const result = await importBundledDependency({
        workspaceDir: path.join(root, 'workspace'),
        packageDir,
        archivePath: '../outside.tar.gz',
        metadata
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('path_traversal');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
