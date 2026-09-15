import type { WorkspaceDependencyRecord, WorkspacePrerequisiteRecord } from '@learnlab/core-types';

interface DependencyListProps {
  dependencies: WorkspaceDependencyRecord[];
  prerequisites: WorkspacePrerequisiteRecord[];
  loading: boolean;
  dependencyError?: string;
  prerequisiteError?: string;
}

export function DependencyList({
  dependencies,
  prerequisites,
  loading,
  dependencyError,
  prerequisiteError
}: DependencyListProps) {
  if (loading) return <p class="workbench-empty-copy">正在读取学习区依赖…</p>;
  return (
    <div class="workbench-catalog-list">
      <div class="workbench-section-caption">托管依赖 <span>{dependencies.length}</span></div>
      {dependencyError && <p class="workbench-sidebar-error">{dependencyError}</p>}
      {!dependencies.length && <p class="workbench-empty-copy">当前学习区没有托管依赖。</p>}
      {dependencies.map((dependency) => (
        <article class="workbench-catalog-row" key={`${dependency.dependencyId}:${dependency.sha256}`}>
          <span class="workbench-file-type" aria-hidden="true">依</span>
          <span>
            <strong>{dependency.dependencyId}</strong>
            <small>{dependency.version} · {dependency.platform}/{dependency.arch}</small>
            <small>{dependency.status} · {dependency.sourceType}</small>
          </span>
        </article>
      ))}
      <div class="workbench-section-caption">外部前置软件 <span>{prerequisites.length}</span></div>
      {prerequisiteError && <p class="workbench-sidebar-error">{prerequisiteError}</p>}
      {!prerequisites.length && <p class="workbench-empty-copy">当前没有外部前置软件声明。</p>}
      {prerequisites.map((item) => (
        <article class="workbench-catalog-row" key={`${item.packageId}:${item.prerequisiteId}`}>
          <span class="workbench-file-type" aria-hidden="true">外</span>
          <span>
            <strong>{item.prerequisiteId}</strong>
            <small>{item.version} · {item.required ? '必需' : '可选'} · {item.detect ?? 'manual'}</small>
          </span>
        </article>
      ))}
    </div>
  );
}
