import type { RegisteredPackage } from '@learnlab/core-types';

interface WorkspacePackageListProps {
  packages: RegisteredPackage[];
  selectedPackageId: string;
  onSelectPackage: (item: RegisteredPackage) => void;
}

export function WorkspacePackageList({ packages, selectedPackageId, onSelectPackage }: WorkspacePackageListProps) {
  return (
    <div class="workbench-package-list">
      <div class="workbench-section-caption">当前学习区 <span>{packages.length} 个实验包</span></div>
      {!packages.length && <p class="workbench-empty-copy">当前学习区没有已注册实验包。</p>}
      {packages.map((item) => (
        <button
          type="button"
          class={`workbench-package-row${item.id === selectedPackageId ? ' is-selected' : ''}`}
          key={item.id}
          onClick={() => onSelectPackage(item)}
        >
          <span>
            <strong>{item.name}</strong>
            <small>{item.id}@{item.version}</small>
          </span>
          {item.id === selectedPackageId && <small>当前</small>}
        </button>
      ))}
    </div>
  );
}
