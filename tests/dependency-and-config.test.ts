import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dependencyFingerprint } from '../packages/core-types/src/adapter';
import { getDependencyInstallPath } from '../packages/core/src/dependency-paths';
import { readConfig, writeConfig } from '../packages/core/src/config-store';
import type { AppConfig, DependencyMetadata } from '@learnlab/core-types';

const metadata: DependencyMetadata = { id: 'org.mysql', version: '8.0.0', platform: 'linux', arch: 'x64', archive: { file: 'mysql.tar.gz', sha256: 'A'.repeat(64), size: 12 } };
const defaults: AppConfig = { workspace: {}, plugins: { demo: { enabled: true } } };

describe('dependency identity and config store', () => {
  it('creates a stable identity and scoped install path', () => {
    expect(dependencyFingerprint(metadata)).toBe(`org.mysql@8.0.0@linux@x64@${'a'.repeat(64)}`);
    expect(getDependencyInstallPath('/workspace', metadata)).toBe(`/workspace/dependencies/org.mysql/8.0.0/linux-x64/${'a'.repeat(64)}`);
  });

  it('rejects unsafe dependency path segments', () => {
    expect(() => getDependencyInstallPath('/workspace', { ...metadata, id: '../escape' })).toThrow();
    expect(() => getDependencyInstallPath('/workspace', metadata)).not.toThrow();
  });

  it('writes JSON atomically and merges defaults when reading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'learnlab-config-'));
    const file = join(root, 'nested', 'settings.json');
    const config = { ...defaults, workspace: { lastOpenedPackage: '/tmp/package' } };
    expect((await writeConfig(file, config)).ok).toBe(true);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(config);
    const result = await readConfig(file, defaults);
    expect(result).toEqual({ ok: true, value: config });
  });
});
