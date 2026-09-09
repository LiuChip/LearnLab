import { useEffect, useState, useCallback } from 'preact/hooks';
import type { RegisteredPackage } from '@learnlab/core-types';
import { useReadingStore } from './stores/readingStore';
import { ChapterTree } from './components/navigation/ChapterTree';
import { ContentsOutline } from './components/navigation/ContentsOutline';
import { ChapterReader } from './components/content/ChapterReader';
import './styles/base.css';
import './styles/theme.css';
import './styles/markdown.css';

export function App() {
  const store = useReadingStore();
  const [workspacePackages, setWorkspacePackages] = useState<RegisteredPackage[]>([]);
  const [selectedPkgPath, setSelectedPkgPath] = useState<string>('');

  // Initial package source discovery
  useEffect(() => {
    let cancelled = false;
    async function initPackageSource() {
      try {
        let pkgDir: string | null = null;
        // Check if there are registered workspace packages
        // In current MVP without an active chosen workspace folder, fallback to example
        const exampleDir = await window.learnlab.getExamplePackageDir();
        pkgDir = exampleDir;
        setSelectedPkgPath(exampleDir);
        setWorkspacePackages([
          { id: 'example', name: 'SQL 基础入门 (示例)', version: '1.0.0', path: exampleDir, isSymlink: false, registeredAt: '' }
        ]);

        if (!cancelled && pkgDir) {
          await store.loadPackageByPath(pkgDir);
        }
      } catch (err) {
        console.error('Failed to initialize package source:', err);
      }
    }
    void initPackageSource();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleJumpToHeading = useCallback((headingId: string) => {
    const el = document.getElementById(headingId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleSearchSubmit = (e: Event) => {
    e.preventDefault();
    if (store.searchQuery.trim()) {
      store.runSearch(store.searchQuery);
    }
  };

  const handleSelectSearchMatch = (chapterId: string) => {
    store.selectChapter(chapterId);
  };

  return (
    <main class="app-shell">
      {/* 顶部标题栏 */}
      <header class="app-header">
        <div class="header-title-area">
          <strong>{store.packageName}</strong>
          <span>LearnLab 本地交互式实验浏览器</span>
        </div>
        {workspacePackages.length > 1 && (
          <select
            value={selectedPkgPath}
            onChange={(e) => {
              const path = (e.target as HTMLSelectElement).value;
              setSelectedPkgPath(path);
              store.loadPackageByPath(path);
            }}
          >
            {workspacePackages.map((p) => (
              <option key={p.id} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </header>

      {/* 主工作区两栏布局 */}
      <section class="reader-layout">
        <aside class="sidebar">
          {/* 搜索面板 */}
          <div class="search-box">
            <form onSubmit={handleSearchSubmit} class="search-form">
              <div class="search-input-wrapper">
                <input
                  type="text"
                  class="search-input"
                  placeholder="搜索当前实验包..."
                  value={store.searchQuery}
                  onInput={(e) => store.setSearchQuery((e.target as HTMLInputElement).value)}
                />
                <button type="submit" class="option-btn" title="执行搜索">
                  🔍
                </button>
              </div>
              <div class="search-options">
                <button
                  type="button"
                  class={`option-btn ${store.searchOptions.caseSensitive ? 'is-active' : ''}`}
                  onClick={() => store.toggleSearchOption('caseSensitive')}
                  title="区分大小写 (Aa)"
                >
                  Aa
                </button>
                <button
                  type="button"
                  class={`option-btn ${store.searchOptions.wholeWord ? 'is-active' : ''}`}
                  onClick={() => store.toggleSearchOption('wholeWord')}
                  title="全字匹配 (\b)"
                >
                  \b
                </button>
                <button
                  type="button"
                  class={`option-btn ${store.searchOptions.isRegex ? 'is-active' : ''}`}
                  onClick={() => store.toggleSearchOption('isRegex')}
                  title="正则表达式 (.*)"
                >
                  .*
                </button>
                {store.searchResults && (
                  <button
                    type="button"
                    class="clear-search-btn"
                    onClick={store.clearSearch}
                    title="清空搜索结果"
                  >
                    清空
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* 搜索结果展示 */}
          {store.isSearching ? (
            <div class="search-results-panel">
              <div class="search-summary">正在检索实验包...</div>
            </div>
          ) : store.searchResults ? (
            <div class="search-results-panel">
              {store.searchResults.error ? (
                <div class="search-summary" style={{ color: '#dc2626' }}>
                  {store.searchResults.error}
                </div>
              ) : (
                <div class="search-success-content">
                  <div class="search-summary">
                    找到 {store.searchResults.totalMatches} 处匹配 (共检索 {store.searchResults.searchedChapters} 节)
                  </div>
                  {store.searchResults.matches.length > 0 && (
                    <ul class="search-match-list" role="list">
                      {store.searchResults.matches.map((m, idx) => (
                        <li key={idx} class="search-match-item">
                          <button
                            type="button"
                            class="search-match-btn"
                            onClick={() => handleSelectSearchMatch(m.chapterId)}
                          >
                            <div class="match-meta">
                              <span>{m.chapterTitle}</span>
                              <span>第 {m.line} 行</span>
                            </div>
                            <div class="match-snippet">{m.preview}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* 章节目录 */}
          <ChapterTree
            chapters={store.chapters}
            activeChapterId={store.activeChapterId}
            onSelectChapter={store.selectChapter}
          />

          {/* 本章大纲 */}
          <ContentsOutline
            headings={store.markdown?.headings ?? []}
            onJumpToHeading={handleJumpToHeading}
          />
        </aside>

        {/* 章节阅读主体 */}
        <ChapterReader
          markdown={store.markdown}
          activeChapter={store.activeChapter}
          prevChapter={store.prevChapter}
          nextChapter={store.nextChapter}
          readonlyStatus={store.readonlyStatus}
          isLoading={store.isLoading}
          error={store.error}
          copyStatus={store.copyStatus}
          onNavigateChapter={store.selectChapter}
          onToggleCompleted={store.toggleCompleted}
          onCopyCode={store.copyCodeToClipboard}
          onScrollChange={store.updateScroll}
        />
      </section>
    </main>
  );
}
