import { useEffect, useRef } from 'preact/hooks';
import type { MarkdownResult } from '@learnlab/markdown';
import type { ChapterEntry } from '@learnlab/core-types';
import type { ChapterNavigationItem, PluginReadonlyStatus } from '../../utils/navigation';
import type { ReadingError } from '../../stores/readingStore';

interface ChapterReaderProps {
  markdown: MarkdownResult | null;
  activeChapter: ChapterNavigationItem | null;
  prevChapter: ChapterEntry | null;
  nextChapter: ChapterEntry | null;
  readonlyStatus: PluginReadonlyStatus;
  isLoading: boolean;
  error: ReadingError | null;
  copyStatus: { id: string; status: 'copied' | 'error'; message?: string } | null;
  onNavigateChapter: (chapterId: string) => void;
  onToggleCompleted: (completed: boolean) => void;
  onCopyCode: (code: string, codeId: string) => void;
  onScrollChange: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
}

export function ChapterReader({
  markdown,
  activeChapter,
  prevChapter,
  nextChapter,
  readonlyStatus,
  isLoading,
  error,
  copyStatus,
  onNavigateChapter,
  onToggleCompleted,
  onCopyCode,
  onScrollChange
}: ChapterReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const prevChapterIdRef = useRef<string | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Restore scroll position when chapter finishes loading or changes
  useEffect(() => {
    if (!articleRef.current || !activeChapter || isLoading) return;

    if (prevChapterIdRef.current !== activeChapter.id) {
      prevChapterIdRef.current = activeChapter.id;
      isProgrammaticScrollRef.current = true;
      articleRef.current.scrollTop = activeChapter.scrollY ?? 0;
    }
  }, [activeChapter?.id, activeChapter?.scrollY, isLoading]);

  // Attach copy buttons to rendered code blocks
  useEffect(() => {
    if (!contentRef.current) return;
    const preElements = contentRef.current.querySelectorAll('pre');

    preElements.forEach((pre, index) => {
      const codeId = `${activeChapter?.id ?? 'ch'}-code-${index}`;
      let header = pre.previousElementSibling as HTMLElement | null;
      if (!header || !header.classList.contains('code-block-header')) {
        header = document.createElement('div');
        header.className = 'code-block-header';

        const title = document.createElement('span');
        title.className = 'code-block-title';
        const codeElement = pre.querySelector('code');
        const langClass = codeElement ? Array.from(codeElement.classList).find((c) => c.startsWith('language-')) : null;
        title.textContent = langClass ? langClass.replace('language-', '') : '代码块';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'code-copy-btn';
        copyBtn.setAttribute('data-code-id', codeId);
        copyBtn.textContent = '复制代码';
        copyBtn.onclick = () => {
          const textToCopy = (codeElement?.textContent || pre.textContent || '').replace(/\r\n/g, '\n');
          onCopyCode(textToCopy, codeId);
        };

        header.appendChild(title);
        header.appendChild(copyBtn);
        pre.parentNode?.insertBefore(header, pre);
      } else {
        const copyBtn = header.querySelector('.code-copy-btn') as HTMLButtonElement | null;
        if (copyBtn) {
          const codeElement = pre.querySelector('code');
          copyBtn.onclick = () => {
            const textToCopy = (codeElement?.textContent || pre.textContent || '').replace(/\r\n/g, '\n');
            onCopyCode(textToCopy, codeId);
          };
          if (copyStatus?.id === codeId) {
            if (copyStatus.status === 'copied') {
              copyBtn.textContent = '已复制 √';
              copyBtn.classList.add('is-copied');
            } else if (copyStatus.status === 'error') {
              copyBtn.textContent = '复制失败';
              copyBtn.classList.add('is-error');
            }
          } else {
            copyBtn.textContent = '复制代码';
            copyBtn.classList.remove('is-copied', 'is-error');
          }
        }
      }
    });
  }, [markdown?.html, isLoading, copyStatus, onCopyCode, activeChapter?.id]);

  const handleScroll = (event: Event) => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      return;
    }
    const el = event.currentTarget as HTMLElement;
    if (el) {
      onScrollChange(el.scrollTop, el.scrollHeight, el.clientHeight);
    }
  };

  return (
    <article
      ref={articleRef}
      class="chapter-reader"
      onScroll={handleScroll}
      tabIndex={0}
      aria-label="章节正文阅读器"
    >
      {/* 顶部状态与进度条 */}
      <header class="reader-top-bar">
        <div class="progress-info">
          <span class="progress-label">
            阅读进度: {Math.round(activeChapter?.progressPercent ?? 0)}%
          </span>
          <div class="progress-track" role="progressbar" aria-valuenow={Math.round(activeChapter?.progressPercent ?? 0)} aria-valuemin={0} aria-valuemax={100}>
            <div
              class="progress-fill"
              style={{ width: `${Math.round(activeChapter?.progressPercent ?? 0)}%` }}
            />
          </div>
        </div>
        <div class="reader-actions">
          <button
            type="button"
            class={`action-button mark-btn ${activeChapter?.completed ? 'is-completed' : ''}`}
            onClick={() => onToggleCompleted(!activeChapter?.completed)}
            title="快捷标记阅读完成状态（不影响实验判定）"
          >
            {activeChapter?.completed ? '✓ 已读 (点击重置)' : '标记为已读'}
          </button>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div class="reader-alert alert-error" role="alert">
          <strong>加载错误 ({error.type})：</strong> {error.message}
        </div>
      )}

      {/* 缺失插件只读提示 */}
      {readonlyStatus.isReadOnly && (
        <div class="reader-alert alert-warning" role="status">
          <strong>只读模式提示：</strong> {readonlyStatus.reason}
        </div>
      )}

      {/* 复制失败提示 */}
      {copyStatus?.status === 'error' && copyStatus.message && (
        <div class="reader-alert alert-error" role="alert">
          {copyStatus.message}
        </div>
      )}

      {/* 加载中状态 */}
      {isLoading ? (
        <div class="reader-loading">
          <div class="loading-spinner" />
          <p>正在加载章节正文……</p>
        </div>
      ) : markdown ? (
        <div
          ref={contentRef}
          class="reader-markdown-content"
          dangerouslySetInnerHTML={{ __html: markdown.html }}
        />
      ) : (
        <div class="reader-empty">
          <p>请在左侧选择章节开始阅读。</p>
        </div>
      )}

      {/* 底部前后章节导航 */}
      {activeChapter && !isLoading && (
        <footer class="reader-footer-nav">
          <button
            type="button"
            class="nav-btn prev-btn"
            disabled={!prevChapter}
            onClick={() => prevChapter && onNavigateChapter(prevChapter.id)}
          >
            {prevChapter ? `← 上一章：${prevChapter.title}` : '已是第一章'}
          </button>
          <button
            type="button"
            class="nav-btn mark-complete-btn"
            onClick={() => onToggleCompleted(!activeChapter.completed)}
          >
            {activeChapter.completed ? '已完成本章阅读' : '完成本章阅读'}
          </button>
          <button
            type="button"
            class="nav-btn next-btn"
            disabled={!nextChapter}
            onClick={() => nextChapter && onNavigateChapter(nextChapter.id)}
          >
            {nextChapter ? `下一章：${nextChapter.title} →` : '已读完全部章节'}
          </button>
        </footer>
      )}
    </article>
  );
}
