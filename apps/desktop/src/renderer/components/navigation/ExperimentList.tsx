import type { ExperimentMarker, ExperimentParseResult } from '@learnlab/markdown';
import type { ChapterNavigationItem, PluginReadonlyStatus } from '../../utils/navigation';

interface ExperimentListProps {
  chapter: ChapterNavigationItem | null;
  parsed: ExperimentParseResult;
  readonlyStatus: PluginReadonlyStatus;
  onOpenExperiment: (experiment: ExperimentMarker) => void;
}

export function ExperimentList({ chapter, parsed, readonlyStatus, onOpenExperiment }: ExperimentListProps) {
  if (!chapter) return <p class="workbench-empty-copy">请先打开一个章节。</p>;
  return (
    <div>
      <div class="workbench-sidebar-context">{chapter.title}</div>
      {readonlyStatus.isReadOnly && <p class="workbench-sidebar-warning">{readonlyStatus.reason}</p>}
      {parsed.errors.map((error) => (
        <p class="workbench-sidebar-error" key={`${error.line}:${error.message}`}>
          第 {error.line} 行：{error.message}
        </p>
      ))}
      {parsed.experiments.length === 0 && parsed.errors.length === 0 && (
        <p class="workbench-empty-copy">当前章节没有实验。</p>
      )}
      {parsed.experiments.map((experiment) => (
        <div class="workbench-catalog-row" key={experiment.id}>
          <span>
            <strong>{experiment.title}</strong>
            <small>{experiment.type === 'auto' ? '自动判定' : '手动判定'} · {experiment.id}</small>
          </span>
          <button type="button" class="workbench-text-button" onClick={() => onOpenExperiment(experiment)}>
            打开实验
          </button>
        </div>
      ))}
    </div>
  );
}
