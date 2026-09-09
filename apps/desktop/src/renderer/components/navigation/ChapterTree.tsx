import type { ChapterNavigationItem } from '../../utils/navigation';

interface ChapterTreeProps {
  chapters: ChapterNavigationItem[];
  activeChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

export function ChapterTree({
  chapters,
  activeChapterId,
  onSelectChapter
}: ChapterTreeProps) {
  return (
    <nav class="chapter-tree" aria-label="章节导航">
      <div class="tree-header">
        <h2>章节目录</h2>
        <span class="chapter-count">共 {chapters.length} 节</span>
      </div>
      {chapters.length === 0 ? (
        <div class="empty-tree-message">当前实验包无章节</div>
      ) : (
        <ul class="tree-list" role="list">
          {chapters.map((chapter) => {
            const isActive = chapter.id === activeChapterId;
            return (
              <li
                key={chapter.id}
                class={`tree-item ${isActive ? 'is-active' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  class="tree-button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectChapter(chapter.id)}
                >
                  <span
                    class={`status-icon ${chapter.completed ? 'is-completed' : chapter.progressPercent > 0 ? 'is-progress' : ''}`}
                    title={
                      chapter.completed
                        ? '已完成'
                        : chapter.progressPercent > 0
                          ? `阅读中 (${chapter.progressPercent}%)`
                          : '未开始'
                    }
                  >
                    {chapter.completed ? '✓' : chapter.progressPercent > 0 ? `${Math.round(chapter.progressPercent)}%` : '○'}
                  </span>
                  <span class="chapter-title">
                    {chapter.title}
                  </span>
                  {chapter.experimentCount > 0 && (
                    <span class="experiment-badge" title={`包含 ${chapter.experimentCount} 个动手实验`}>
                      实验: {chapter.experimentCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
