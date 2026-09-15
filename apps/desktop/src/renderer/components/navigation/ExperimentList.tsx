import type { ChapterNavigationItem, PluginReadonlyStatus } from '../../utils/navigation';

interface ExperimentListProps {
  chapter: ChapterNavigationItem | null;
  readonlyStatus: PluginReadonlyStatus;
}

export function ExperimentList({ chapter, readonlyStatus }: ExperimentListProps) {
  if (!chapter) return <p class="workbench-empty-copy">请先打开一个章节。</p>;
  return (
    <div>
      <div class="workbench-sidebar-context">{chapter.title}</div>
      {readonlyStatus.isReadOnly && <p class="workbench-sidebar-warning">{readonlyStatus.reason}</p>}
      {chapter.experimentCount > 0 ? (
        <p class="workbench-empty-copy">
          本章声明包含 {chapter.experimentCount} 个实验。实验标记解析与运行宿主尚未接入，因此暂不生成可运行条目。
        </p>
      ) : <p class="workbench-empty-copy">当前章节没有声明实验。</p>}
    </div>
  );
}
