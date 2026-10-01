import type { PluginManifest } from '@learnlab/core-types';
import defaultPluginIconUrl from '../../assets/icons/activity-bar/plugin.svg?url';

interface PluginListProps {
  plugins: PluginManifest[];
  loadedCount: number;
  loading: boolean;
  error?: string;
}

export function PluginList({ plugins, loadedCount, loading, error }: PluginListProps) {
  if (loading) return <p class="workbench-empty-copy">正在读取插件注册表…</p>;
  return (
    <div class="workbench-catalog-list">
      <div class="workbench-sidebar-context">当前实验包已解析 {loadedCount} 个插件</div>
      {error && <p class="workbench-sidebar-error">{error}</p>}
      {!plugins.length && <p class="workbench-empty-copy">没有已安装插件。</p>}
      {plugins.map((plugin) => (
        <article class="workbench-catalog-row" key={`${plugin.plugin_id}@${plugin.version}`}>
          <span class="workbench-file-type workbench-plugin-icon" aria-hidden="true">
            <span style={{ maskImage: `url("${defaultPluginIconUrl}")`, WebkitMaskImage: `url("${defaultPluginIconUrl}")` }} />
          </span>
          <span>
            <strong>{plugin.plugin_id}</strong>
            <small>{plugin.version} · {plugin.activation?.mode === 'global' ? '全局加载' : '按实验包加载'}</small>
            <small>{plugin.author ?? '作者未标注'}</small>
          </span>
        </article>
      ))}
    </div>
  );
}
