import { describe, expect, it } from 'vitest';
import { loadWorkbenchCatalog } from '../apps/desktop/src/renderer/stores/catalogStore';

describe('workbench catalog loading', () => {
  it('keeps successful catalog data when one optional source fails', async () => {
    const result = await loadWorkbenchCatalog({
      listPlugins: async () => [{ plugin_id: 'org.learnlab.vim', version: '1.0.0' }],
      listDependencies: async () => {
        throw new Error('dependency database unavailable');
      },
      listPrerequisites: async () => [
        {
          prerequisiteId: 'git',
          packageId: 'learnlab.git',
          version: '>=2',
          required: true
        }
      ]
    });

    expect(result.plugins).toHaveLength(1);
    expect(result.dependencies).toEqual([]);
    expect(result.prerequisites).toHaveLength(1);
    expect(result.loading).toBe(false);
    expect(result.errors.dependencies).toContain('依赖目录');
    expect(result.errors.dependencies).toContain('dependency database unavailable');
    expect(result.errors.plugins).toBeUndefined();
  });

  it('reports every failed optional source without rejecting', async () => {
    const result = await loadWorkbenchCatalog({
      listPlugins: async () => {
        throw new Error('plugin registry unavailable');
      },
      listDependencies: async () => {
        throw new Error('dependency database unavailable');
      },
      listPrerequisites: async () => []
    });

    expect(result.plugins).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.prerequisites).toEqual([]);
    expect(result.errors.plugins).toContain('插件目录');
    expect(result.errors.dependencies).toContain('依赖目录');
    expect(result.errors.prerequisites).toBeUndefined();
  });
});
