import { useEffect, useState, useCallback } from 'preact/hooks';
import type { RegisteredPackage } from '@learnlab/core-types';
import { useReadingStore } from './stores/readingStore';
import { ChapterTree } from './components/navigation/ChapterTree';
import { ContentsOutline } from './components/navigation/ContentsOutline';
import { ChapterReader } from './components/content/ChapterReader';
import { AppShell } from './components/shell/AppShell';
import type { WorkbenchActivityId } from './utils/workbench';
import './styles/base.css';
import './styles/theme.css';
import './styles/markdown.css';
import './styles/workbench-layout.css';

export function App() {
  const store = useReadingStore();
  const [workspacePackages, setWorkspacePackages] = useState<RegisteredPackage[]>([]);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [selectedPkgPath, setSelectedPkgPath] = useState<string>('');
  const [activeActivity, setActiveActivity] = useState<WorkbenchActivityId>('chapters');
  const [primaryVisible, setPrimaryVisible] = useState(true);
  const [bottomPanelVisible, setBottomPanelVisible] = useState(false);

  // The default workspace is the user's package registry. The repository's
  // examples are fixtures and must not become an implicit user package.
  useEffect(() => {
    let cancelled = false;
    async function initWorkspace() {
      try {
        const defaultDir = await window.learnlab.workspace.getDefaultDir();
        if (cancelled) return;
        await window.learnlab.workspace.init(defaultDir);
        if (cancelled) return;

        const packages = await window.learnlab.workspace.listPackages(defaultDir);
        if (cancelled) return;

        setWorkspaceDir(defaultDir);
        setWorkspacePackages(packages);
        const initialPackage = packages[0];
        if (!initialPackage) {
          setSelectedPkgPath('');
          store.clearView();
          return;
        }

        setSelectedPkgPath(initialPackage.path);
        await store.loadPackageByPath(initialPackage.path);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to initialize package source:', err);
        store.clearView({
          type: 'workspace_error',
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
    void initWorkspace();
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
    <AppShell
      packageName={store.packageName || '未选择实验包'}
      activeActivity={activeActivity}
      primaryVisible={primaryVisible}
      bottomPanelVisible={bottomPanelVisible}
      progress={Math.round(store.activeChapter?.progressPercent ?? 0)}
      pluginCount={store.loadedPluginCount}
      unreadMessages={0}
      onActivityChange={setActiveActivity}
      onTogglePrimary={() => setPrimaryVisible((visible) => !visible)}
      onToggleBottomPanel={() => setBottomPanelVisible((visible) => !visible)}
      sidebar={
        <div class="workbench-sidebar-stack">
          {workspaceDir && workspacePackages.length > 1 && (
            <select
              class="workbench-package-select"
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
          {/* 搜索面板 */}
          {activeActivity === 'search' && <div class="search-box workbench-legacy-panel">
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
          </div>}

          {/* 搜索结果展示 */}
          {activeActivity === 'search' && (store.isSearching ? (
            <div class="search-results-panel">
              <div class="search-summary">正在检索实验包...</div>
            </div>
          ) : store.searchResults ? (
            <div class="search-results-panel">
              {store.searchResults.error ? (
                <div class="search-error-content">
                  <div class="search-summary" style={{ color: '#dc2626' }}>
                    {store.searchResults.error}
                  </div>
                  {store.searchResults.warnings.length > 0 && (
                    <ul class="search-warning-list" role="list">
                      {store.searchResults.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div class="search-success-content">
                  <div class="search-summary">
                    找到 {store.searchResults.totalMatches} 处匹配 (共检索 {store.searchResults.searchedChapters} 节)
                  </div>
                  {(store.searchResults.skippedChapters > 0 || store.searchResults.skippedPackages > 0) && (
                    <div class="search-warning-summary">
                      已跳过 {store.searchResults.skippedChapters} 个章节、{store.searchResults.skippedPackages} 个实验包
                    </div>
                  )}
                  {store.searchResults.warnings.length > 0 && (
                    <ul class="search-warning-list" role="list">
                      {store.searchResults.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  )}
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
          ) : null)}

          {/* 章节目录 */}
          {activeActivity === 'chapters' && (
            <ChapterTree
              chapters={store.chapters}
              activeChapterId={store.activeChapterId}
              onSelectChapter={store.selectChapter}
            />
          )}

          {/* 本章大纲 */}
          {activeActivity === 'chapters' && (
            <ContentsOutline
              headings={store.markdown?.headings ?? []}
              onJumpToHeading={handleJumpToHeading}
            />
          )}
          {activeActivity !== 'chapters' && activeActivity !== 'search' && (
            <div class="workbench-empty-view">{activeActivity} 视图尚未接入。</div>
          )}
        </div>
      }
      editor={
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
      }
    />
  );
}
