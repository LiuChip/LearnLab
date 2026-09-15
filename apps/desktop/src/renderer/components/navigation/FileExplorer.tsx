import type { ChapterNavigationItem } from '../../utils/navigation';

interface FileExplorerProps {
  packageName: string;
  chapters: ChapterNavigationItem[];
  activeChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
}

export function FileExplorer({ packageName, chapters, activeChapterId, onSelectChapter }: FileExplorerProps) {
  return (
    <div class="workbench-file-tree">
      <div class="workbench-section-caption"><strong>{packageName || '未选择实验包'}</strong></div>
      {!chapters.length ? <p class="workbench-empty-copy">没有可显示的章节文件。</p> : (
        <div>
          <div class="workbench-file-row is-folder"><span aria-hidden="true">⌄</span><span>chapters</span></div>
          {chapters.map((chapter) => (
            <button
              type="button"
              class={`workbench-file-row is-file${chapter.id === activeChapterId ? ' is-selected' : ''}`}
              key={chapter.id}
              onClick={() => onSelectChapter(chapter.id)}
              title={chapter.file}
            >
              <span aria-hidden="true">M↓</span><span>{chapter.file.split('/').at(-1)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
