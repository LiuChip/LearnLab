import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getDisabledPluginIds,
  listInstalledPlugins
} from '../apps/desktop/src/main/services/plugin-registry';

describe('installed plugin registry', () => {
  it('discovers valid plugin manifests and ignores malformed entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-plugin-registry-'));
    try {
      await mkdir(path.join(root, 'org.example.valid'), { recursive: true });
      await writeFile(
        path.join(root, 'org.example.valid', 'manifest.yaml'),
        'plugin_id: org.example.valid\nversion: 1.2.0\nactivation:\n  mode: global\n'
      );
      await mkdir(path.join(root, 'org.example.invalid'), { recursive: true });
      await writeFile(path.join(root, 'org.example.invalid', 'manifest.yaml'), 'version: 1.0.0\n');

      const plugins = await listInstalledPlugins(root);

      expect(plugins).toEqual([
        {
          plugin_id: 'org.example.valid',
          version: '1.2.0',
          activation: { mode: 'global' }
        }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('treats a missing plugin directory as an empty installation', async () => {
    const root = path.join(await mkdtemp(path.join(tmpdir(), 'learnlab-plugin-registry-')), 'missing');
    try {
      await expect(listInstalledPlugins(root)).resolves.toEqual([]);
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('extracts only explicitly disabled plugin settings', () => {
    expect(
      getDisabledPluginIds({
        workspace: {},
        plugins: {
          'org.enabled': { enabled: true },
          'org.default': {},
          'org.disabled': { enabled: false }
        }
      })
    ).toEqual(['org.disabled']);
  });
});
