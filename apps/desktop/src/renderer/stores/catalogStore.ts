import type {
  PluginManifest,
  WorkspaceDependencyRecord,
  WorkspacePrerequisiteRecord
} from '@learnlab/core-types';

export interface WorkbenchCatalog {
  plugins: PluginManifest[];
  dependencies: WorkspaceDependencyRecord[];
  prerequisites: WorkspacePrerequisiteRecord[];
  loading: boolean;
  errors: {
    plugins?: string;
    dependencies?: string;
    prerequisites?: string;
  };
}

interface WorkbenchCatalogLoaders {
  listPlugins: () => Promise<PluginManifest[]>;
  listDependencies: () => Promise<WorkspaceDependencyRecord[]>;
  listPrerequisites: () => Promise<WorkspacePrerequisiteRecord[]>;
}

export async function loadWorkbenchCatalog(
  loaders: WorkbenchCatalogLoaders
): Promise<WorkbenchCatalog> {
  const [plugins, dependencies, prerequisites] = await Promise.allSettled([
    loaders.listPlugins(),
    loaders.listDependencies(),
    loaders.listPrerequisites()
  ]);

  const failureMessage = (label: string, result: PromiseRejectedResult): string => {
    const detail = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return `${label}读取失败：${detail}`;
  };

  return {
    plugins: plugins.status === 'fulfilled' ? plugins.value : [],
    dependencies: dependencies.status === 'fulfilled' ? dependencies.value : [],
    prerequisites: prerequisites.status === 'fulfilled' ? prerequisites.value : [],
    loading: false,
    errors: {
      plugins: plugins.status === 'rejected' ? failureMessage('插件目录', plugins) : undefined,
      dependencies:
        dependencies.status === 'rejected' ? failureMessage('依赖目录', dependencies) : undefined,
      prerequisites:
        prerequisites.status === 'rejected'
          ? failureMessage('外部前置软件', prerequisites)
          : undefined
    }
  };
}
