import { useState } from 'preact/hooks';
import type { HeadingEntry } from '@learnlab/markdown';

interface AuxiliarySidebarProps {
  packageName: string;
  packageVersion?: string;
  chapterTitle?: string;
  progress: number;
  pluginCount: number;
  headings: HeadingEntry[];
  onJumpToHeading: (headingId: string) => void;
}

export function AuxiliarySidebar({
  packageName,
  packageVersion,
  chapterTitle,
  progress,
  pluginCount,
  headings,
  onJumpToHeading
}: AuxiliarySidebarProps) {
  const [tab, setTab] = useState<'outline' | 'context'>('outline');

  return (
    <aside class="workbench-auxiliary-sidebar" aria-label="辅助视图">
      <header class="workbench-auxiliary-heading">
        <strong>辅助视图</strong>
      </header>
      <div class="workbench-auxiliary-tabs" role="tablist" aria-label="辅助标签">
        <button type="button" role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>大纲</button>
        <button type="button" role="tab" aria-selected={tab === 'context'} onClick={() => setTab('context')}>上下文</button>
      </div>
      {tab === 'outline' && (
        <div class="workbench-auxiliary-content">
          {headings.length ? (
            <ul class="workbench-outline-list">
              {headings.map((heading) => (
                <li key={heading.id} style={{ paddingLeft: `${Math.max(0, heading.depth - 1) * 12}px` }}>
                  <button type="button" onClick={() => onJumpToHeading(heading.id)} title={heading.text}>{heading.text}</button>
                </li>
              ))}
            </ul>
          ) : <p class="workbench-empty-copy">当前文档没有标题大纲。</p>}
        </div>
      )}
      {tab === 'context' && (
        <div class="workbench-auxiliary-content">
          <dl class="workbench-context-list">
            <div><dt>实验包</dt><dd>{packageName || '未选择'}</dd></div>
            <div><dt>版本</dt><dd>{packageVersion ?? '—'}</dd></div>
            <div><dt>当前文档</dt><dd>{chapterTitle ?? '—'}</dd></div>
            <div><dt>阅读进度</dt><dd>{chapterTitle ? `${progress}%` : '—'}</dd></div>
            <div><dt>已加载插件</dt><dd>{pluginCount}</dd></div>
          </dl>
        </div>
      )}
    </aside>
  );
}
