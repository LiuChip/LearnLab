import { describe, expect, it } from 'vitest';
import { resolvePlugins, satisfiesPluginVersion } from '../packages/core/src/plugin-resolver';
import type { PluginManifest } from '@learnlab/core-types';

const plugin = (plugin_id: string, version: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({ plugin_id, version, ...extra });

describe('plugin resolver', () => {
  it('loads global plugins and only package-required package plugins in dependency order', () => {
    const result = resolvePlugins({
      installedPlugins: [
        plugin('org.vim', '1.0.0', { activation: { mode: 'global' } }),
        plugin('org.sql', '1.0.0', { requires_plugins: [{ id: 'org.terminal', version: '^1.0.0' }] }),
        plugin('org.terminal', '1.2.0'),
        plugin('org.unused', '1.0.0')
      ],
      packageRequirements: [{ id: 'org.sql', version: '>=1.0.0' }]
    });

    expect(result.loadOrder).toEqual(['org.vim', 'org.terminal', 'org.sql']);
    expect(result.issues).toEqual([]);
    expect(result.readOnly).toBe(false);
  });

  it('reports missing, incompatible and disabled plugins without throwing', () => {
    const result = resolvePlugins({
      installedPlugins: [plugin('org.sql', '1.0.0')],
      packageRequirements: [
        { id: 'org.mysql', version: '>=1.0.0' },
        { id: 'org.sql', version: '>=2.0.0' }
      ],
      disabledPluginIds: ['org.sql']
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ requirement: { id: 'org.mysql', version: '>=1.0.0' }, reason: 'missing' }),
      expect.objectContaining({ requirement: { id: 'org.sql', version: '>=2.0.0' }, reason: 'disabled' })
    ]));
    expect(result.readOnly).toBe(true);
  });

  it('detects circular dependencies', () => {
    const result = resolvePlugins({
      installedPlugins: [
        plugin('org.a', '1.0.0', { requires_plugins: [{ id: 'org.b', version: '1.0.0' }] }),
        plugin('org.b', '1.0.0', { requires_plugins: [{ id: 'org.a', version: '1.0.0' }] })
      ],
      packageRequirements: [{ id: 'org.a', version: '1.0.0' }]
    });
    expect(result.cycles).toEqual([['org.a', 'org.b', 'org.a']]);
    expect(result.readOnly).toBe(true);
  });

  it('supports the intentionally small version-range subset', () => {
    expect(satisfiesPluginVersion('1.4.0', '^1.2.0')).toBe(true);
    expect(satisfiesPluginVersion('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfiesPluginVersion('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfiesPluginVersion('1.6.0', '~1.5.0')).toBe(false);
  });
});
