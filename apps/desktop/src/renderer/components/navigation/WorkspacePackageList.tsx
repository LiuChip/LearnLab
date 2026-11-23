import type { RegisteredPackage } from '@learnlab/core-types';
import folderAddIconUrl from '../../assets/icons/file-tree/folder-add.svg?url';

interface WorkspacePackageListProps {
  packages: RegisteredPackage[];
  selectedPackageId: string;
  importing: boolean;
  exampleAvailable: boolean;
  onSelectPackage: (item: RegisteredPackage) => void;
  onImportPackage: () => void;
  onImportExample: () => void;
}

function MaskIcon({ url }: { url: string }) {
  return (
    <span
      class="workbench-mask-icon"
      aria-hidden="true"
      style={{ maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` }}
    />
  );
}

export function WorkspacePackageList({
  packages,
  selectedPackageId,
  importing,
  exampleAvailable,
  onSelectPackage,
  onImportPackage,
  onImportExample
}: WorkspacePackageListProps) {
  return (
    <div class="workbench-package-list">
      <div class="workbench-section-caption">
        <span class="workbench-section-title">当前学习区</span>
        <span class="workbench-section-actions">
          <span>{packages.length} 个实验包</span>
          <button
            type="button"
            class="workbench-icon-button"
            title="导入实验包"
            aria-label="导入实验包"
            disabled={importing}
            onClick={onImportPackage}
          >
            <MaskIcon url={folderAddIconUrl} />
          </button>
        </span>
      </div>
      {importing && <p class="workbench-empty-copy">正在导入实验包…</p>}
      {!packages.length && !importing && (
        <div class="workbench-empty-actions">
          <p class="workbench-empty-copy">
            当前学习区还没有实验包。选择一个本地实验包目录，LearnLab 会把它复制进学习区后登记，原目录不会被修改。
          </p>
          <button type="button" class="workbench-text-button" onClick={onImportPackage}>
            导入实验包…
          </button>
          {exampleAvailable && (
            <button type="button" class="workbench-text-button" onClick={onImportExample}>
              导入示例包（开发环境）
            </button>
          )}
        </div>
      )}
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
