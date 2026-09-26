import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { SearchMatch } from '@learnlab/core';
import type {
  RegisteredPackage
} from '@learnlab/core-types';
import { ChapterReader } from './components/content/ChapterReader';
import { ChapterTree } from './components/navigation/ChapterTree';
import { DependencyList } from './components/navigation/DependencyList';
import { ExperimentList } from './components/navigation/ExperimentList';
import { FileExplorer } from './components/navigation/FileExplorer';
import { PluginList } from './components/navigation/PluginList';
import { SearchReplaceView } from './components/navigation/SearchReplaceView';
import { WorkspacePackageList } from './components/navigation/WorkspacePackageList';
import { AppShell } from './components/shell/AppShell';
import { AuxiliarySidebar } from './components/shell/AuxiliarySidebar';
import { useReadingStore } from './stores/readingStore';
import { loadWorkbenchCatalog, type WorkbenchCatalog } from './stores/catalogStore';
import {
  activateEditorTab,
  closeEditorTab,
  createChapterTabId,
  createEditorTabsState,
  openEditorTab,
  type EditorTab,
  type EditorTabsState
} from './stores/tabStore';
import {
  addNotification,
  clearNotifications,
  createWorkbenchState,
  dismissNotification,
  expireNotification,
  getUnreadNotificationCount,
  selectActivity,
  setBottomPanel,
  toggleNotificationCenter,
  type NotificationInput,
  type WorkbenchState
} from './stores/workbenchStore';
import type { WorkbenchActivityId } from './utils/workbench';
import './styles/base.css';
import './styles/theme.css';
import './styles/markdown.css';
import './styles/workbench-layout.css';

const EMPTY_CATALOG: WorkbenchCatalog = {
  plugins: [],
  dependencies: [],
  prerequisites: [],
  loading: true,
  errors: {}
};

export function App() {
  const store = useReadingStore();
  const [workspacePackages, setWorkspacePackages] = useState<RegisteredPackage[]>([]);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [catalog, setCatalog] = useState<WorkbenchCatalog>(EMPTY_CATALOG);
  const [editorTabs, setEditorTabs] = useState<EditorTabsState>(createEditorTabsState);
  const [workbench, setWorkbench] = useState<WorkbenchState>(() => ({
    ...createWorkbenchState(),
    primaryVisible: window.innerWidth >= 600,
    auxiliaryVisible: window.innerWidth >= 1050
  }));
  const [primaryWidth, setPrimaryWidth] = useState(270);
  const [auxiliaryWidth, setAuxiliaryWidth] = useState(280);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(210);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const lastErrorRef = useRef('');

  const notify = useCallback((input: NotificationInput) => {
    setWorkbench((state) => addNotification(state, input));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeWorkspace() {
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
          setSelectedPackageId('');
          setEditorTabs(createEditorTabsState());
          store.clearView();
          notify({
            level: 'info',
            title: '学习区已打开',
            message: '当前学习区还没有已注册的实验包。'
          });
          return;
        }

        setSelectedPackageId(initialPackage.id);
        await store.loadPackageByPath(initialPackage.path);
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setCatalog({
          ...EMPTY_CATALOG,
          loading: false,
          errors: { dependencies: message, prerequisites: message }
        });
        store.clearView({ type: 'workspace_error', message });
      }
    }

    void initializeWorkspace();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workspaceDir) return;
    let cancelled = false;
    setCatalog(EMPTY_CATALOG);
    void loadWorkbenchCatalog({
      listPlugins: () => window.learnlab.plugins.list(),
      listDependencies: () => window.learnlab.dependencies.list(workspaceDir),
      listPrerequisites: () => window.learnlab.dependencies.prerequisites(workspaceDir)
    }).then((nextCatalog) => {
      if (!cancelled) setCatalog(nextCatalog);
    });
    return () => { cancelled = true; };
  }, [workspaceDir]);

  useEffect(() => {
    if (!store.error) {
      lastErrorRef.current = '';
      return;
    }
    const key = `${store.error.type}:${store.error.message}`;
    if (lastErrorRef.current === key) return;
    lastErrorRef.current = key;
    notify({
      level: 'error',
      title: store.error.type === 'workspace_error' ? '学习区加载失败' : '内容加载失败',
      message: store.error.message
    });
  }, [store.error?.type, store.error?.message, notify]);

  useEffect(() => {
    if (quickOpenVisible) quickInputRef.current?.focus();
  }, [quickOpenVisible]);

  useEffect(() => {
    const activeChapter = store.activeChapter;
    if (!activeChapter || !selectedPackageId) return;
    setEditorTabs((state) => openEditorTab(state, {
      id: createChapterTabId(selectedPackageId, activeChapter.id),
      title: activeChapter.title,
      kind: 'chapter',
      packageId: selectedPackageId,
      chapterId: activeChapter.id
    }));
  }, [store.activeChapter?.id, selectedPackageId]);

  const selectedPackage = workspacePackages.find((item) => item.id === selectedPackageId);
  const quickResults = store.chapters.filter((chapter) =>
    chapter.title.toLocaleLowerCase().includes(quickQuery.trim().toLocaleLowerCase())
  );

  const openChapterTab = useCallback((chapterId: string) => {
    const chapter = store.chapters.find((item) => item.id === chapterId);
    if (!chapter || !selectedPackageId) return;
    const tab: EditorTab = {
      id: createChapterTabId(selectedPackageId, chapter.id),
      title: chapter.title,
      kind: 'chapter',
      packageId: selectedPackageId,
      chapterId: chapter.id
    };
    setEditorTabs((state) => openEditorTab(state, tab));
    void store.selectChapter(chapter.id);
  }, [store.chapters, store.selectChapter, selectedPackageId]);

  const switchPackage = useCallback(async (item: RegisteredPackage, preferredChapterId?: string) => {
    if (item.id === selectedPackageId && !preferredChapterId) return;
    setSelectedPackageId(item.id);
    setEditorTabs(createEditorTabsState());
    await store.loadPackageByPath(item.path, preferredChapterId);
  }, [selectedPackageId, store.loadPackageByPath]);

  const selectSearchMatch = useCallback(async (match: SearchMatch) => {
    const item = workspacePackages.find((candidate) => candidate.id === match.packageId);
    if (!item) {
      notify({ level: 'warning', title: '无法打开搜索结果', message: '该实验包已不在当前学习区。' });
      return;
    }
    if (item.id !== selectedPackageId) {
      await switchPackage(item, match.chapterId);
    } else {
      openChapterTab(match.chapterId);
    }
  }, [workspacePackages, selectedPackageId, switchPackage, openChapterTab, notify]);

  const activateTab = useCallback((tabId: string) => {
    const tab = editorTabs.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    setEditorTabs((state) => activateEditorTab(state, tabId));
    if (tab.packageId === selectedPackageId) void store.selectChapter(tab.chapterId);
  }, [editorTabs.tabs, selectedPackageId, store.selectChapter]);

  const closeTab = useCallback((tabId: string) => {
    const closingActiveTab = editorTabs.activeTabId === tabId;
    const nextState = closeEditorTab(editorTabs, tabId);
    setEditorTabs(nextState);
    if (!closingActiveTab) return;
    const nextTab = nextState.tabs.find((item) => item.id === nextState.activeTabId);
    if (nextTab?.packageId === selectedPackageId) void store.selectChapter(nextTab.chapterId);
  }, [editorTabs, selectedPackageId, store.selectChapter]);

  const jumpToHeading = useCallback((headingId: string) => {
    document.getElementById(headingId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const searchCurrentWorkspace = useCallback((query: string) => {
    if (query.trim()) void store.runSearch(query, undefined, workspaceDir);
  }, [store.runSearch, workspaceDir]);

  let sidebar;
  switch (workbench.activeActivity) {
    case 'chapters':
      sidebar = <ChapterTree chapters={store.chapters} activeChapterId={store.activeChapterId} onSelectChapter={openChapterTab} />;
      break;
    case 'search':
      sidebar = (
        <SearchReplaceView
          query={store.searchQuery}
          options={store.searchOptions}
          results={store.searchResults}
          searching={store.isSearching}
          onQueryChange={store.setSearchQuery}
          onToggleOption={store.toggleSearchOption}
          onSearch={searchCurrentWorkspace}
          onSelectMatch={(match) => { void selectSearchMatch(match); }}
        />
      );
      break;
    case 'experiments':
      sidebar = <ExperimentList chapter={store.activeChapter} readonlyStatus={store.readonlyStatus} />;
      break;
    case 'plugins':
      sidebar = <PluginList plugins={catalog.plugins} loadedCount={store.loadedPluginCount} loading={catalog.loading} error={catalog.errors.plugins} />;
      break;
    case 'dependencies':
      sidebar = <DependencyList dependencies={catalog.dependencies} prerequisites={catalog.prerequisites} loading={catalog.loading} dependencyError={catalog.errors.dependencies} prerequisiteError={catalog.errors.prerequisites} />;
      break;
    case 'workspace':
      sidebar = <WorkspacePackageList packages={workspacePackages} selectedPackageId={selectedPackageId} onSelectPackage={(item) => { void switchPackage(item); }} />;
      break;
    case 'explorer':
      sidebar = <FileExplorer packageName={store.packageName} chapters={store.chapters} activeChapterId={store.activeChapterId} onSelectChapter={openChapterTab} />;
      break;
  }

  const editor = editorTabs.activeTabId ? (
    <ChapterReader
      documentKey={editorTabs.activeTabId}
      markdown={store.markdown}
      activeChapter={store.activeChapter}
      prevChapter={store.prevChapter}
      nextChapter={store.nextChapter}
      readonlyStatus={store.readonlyStatus}
      isLoading={store.isLoading}
      error={store.error}
      copyStatus={store.copyStatus}
      onNavigateChapter={openChapterTab}
      onToggleCompleted={store.toggleCompleted}
      onCopyCode={store.copyCodeToClipboard}
      onScrollChange={store.updateScroll}
    />
  ) : (
    <div class="workbench-editor-empty">
      <strong>LearnLab</strong>
      <span>{store.chapters.length ? '从左侧打开一个章节' : '当前没有可打开的章节'}</span>
    </div>
  );

  const expire = useCallback((id: string) => setWorkbench((state) => expireNotification(state, id)), []);
  const dismiss = useCallback((id: string) => setWorkbench((state) => dismissNotification(state, id)), []);
  const toggleCenter = useCallback(() => setWorkbench((state) => toggleNotificationCenter(state)), []);

  return (
    <div class="workbench-app-root">
      <AppShell
        packageName={store.packageName || '未选择实验包'}
        packageVersion={selectedPackage?.version}
        activeActivity={workbench.activeActivity}
        primaryVisible={workbench.primaryVisible}
        auxiliaryVisible={workbench.auxiliaryVisible}
        bottomPanelVisible={workbench.bottomPanelVisible}
        bottomPanel={workbench.bottomPanel}
        theme={workbench.theme}
        primaryWidth={primaryWidth}
        auxiliaryWidth={auxiliaryWidth}
        bottomPanelHeight={bottomPanelHeight}
        progress={Math.round(store.activeChapter?.progressPercent ?? 0)}
        pluginCount={store.loadedPluginCount}
        unreadMessages={getUnreadNotificationCount(workbench)}
        notificationCenterVisible={workbench.notificationCenterVisible}
        notifications={workbench.notifications}
        onActivityChange={(activity: WorkbenchActivityId) => setWorkbench((state) => selectActivity(state, activity))}
        onTogglePrimary={() => setWorkbench((state) => ({ ...state, primaryVisible: !state.primaryVisible }))}
        onToggleBottomPanel={() => setWorkbench((state) => ({ ...state, bottomPanelVisible: !state.bottomPanelVisible }))}
        onSelectBottomPanel={(panel) => setWorkbench((state) => setBottomPanel(state, panel))}
        onShowPlugins={() => setWorkbench((state) => ({ ...state, activeActivity: 'plugins', primaryVisible: true }))}
        onToggleNotifications={toggleCenter}
        onExpireNotification={expire}
        onDismissNotification={dismiss}
        onClearNotifications={() => setWorkbench(clearNotifications)}
        onQuickOpen={() => setQuickOpenVisible(true)}
        onResizePrimary={setPrimaryWidth}
        onResizeAuxiliary={setAuxiliaryWidth}
        onResizeBottomPanel={setBottomPanelHeight}
        tabs={editorTabs.tabs}
        activeTabId={editorTabs.activeTabId}
        onActivateTab={activateTab}
        onCloseTab={closeTab}
        sidebar={sidebar}
        editor={editor}
        auxiliary={(
          <AuxiliarySidebar
            packageName={store.packageName}
            packageVersion={selectedPackage?.version}
            chapterTitle={store.activeChapter?.title}
            progress={Math.round(store.activeChapter?.progressPercent ?? 0)}
            pluginCount={store.loadedPluginCount}
            headings={store.markdown?.headings ?? []}
            onJumpToHeading={jumpToHeading}
          />
        )}
      />
      {quickOpenVisible && (
        <div
          class="workbench-quick-overlay"
          onClick={(event) => { if (event.target === event.currentTarget) setQuickOpenVisible(false); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setQuickOpenVisible(false); }}
        >
          <section class="workbench-quick-open" role="dialog" aria-label="快速打开章节">
            <input
              ref={quickInputRef}
              value={quickQuery}
              placeholder="搜索章节"
              aria-label="章节名称"
              onInput={(event) => setQuickQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && quickResults[0]) {
                  openChapterTab(quickResults[0].id);
                  setQuickOpenVisible(false);
                  setQuickQuery('');
                }
              }}
            />
            <div class="workbench-quick-results">
              {quickResults.map((chapter) => (
                <button
                  type="button"
                  key={chapter.id}
                  onClick={() => {
                    openChapterTab(chapter.id);
                    setQuickOpenVisible(false);
                    setQuickQuery('');
                  }}
                >
                  <span>{chapter.title}</span><small>{store.packageName}</small>
                </button>
              ))}
              {!quickResults.length && <p>没有匹配的章节</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
