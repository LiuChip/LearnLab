import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type {
  RegisteredPackage
} from '@learnlab/core-types';
import { ChapterReader } from './components/content/ChapterReader';
import { ChapterTree } from './components/navigation/ChapterTree';
import { DependencyList } from './components/navigation/DependencyList';
import { ExperimentView } from './components/content/ExperimentView';
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
  createExperimentTabId,
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
import type { ExperimentMarker } from '@learnlab/markdown';
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
  const [importing, setImporting] = useState(false);
  const [exampleAvailable, setExampleAvailable] = useState(false);
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
        void window.learnlab.workspace.isExampleAvailable()
          .then((available) => { if (!cancelled) setExampleAvailable(available); })
          .catch(() => undefined);

        // Restore last session: prefer the package the user had open last time.
        const [lastPackageId, lastChapterId] = await Promise.all([
          window.learnlab.database.getWorkspaceSetting(defaultDir, 'last_package_id').catch(() => null),
          window.learnlab.database.getWorkspaceSetting(defaultDir, 'last_chapter_id').catch(() => null)
        ]);
        if (cancelled) return;

        const restoredPackage = lastPackageId
          ? (packages.find((p) => p.id === lastPackageId) ?? packages[0])
          : packages[0];

        if (!restoredPackage) {
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

        setSelectedPackageId(restoredPackage.id);
        await store.loadPackageByPath(restoredPackage.path, lastChapterId ?? undefined);
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
    // Persist last-visited chapter so it can be restored on next launch.
    if (workspaceDir) {
      void window.learnlab.database.setWorkspaceSetting(workspaceDir, 'last_chapter_id', chapterId).catch(() => undefined);
    }
  }, [store.chapters, store.selectChapter, selectedPackageId, workspaceDir]);

  const openExperimentTab = useCallback((experiment: ExperimentMarker) => {
    if (!selectedPackageId || !store.activeChapterId) return;
    setEditorTabs((state) => openEditorTab(state, {
      id: createExperimentTabId(selectedPackageId, experiment.id),
      title: experiment.title,
      kind: 'experiment',
      packageId: selectedPackageId,
      chapterId: store.activeChapterId as string,
      experimentId: experiment.id,
      experiment
    }));
  }, [selectedPackageId, store.activeChapterId]);

  const switchPackage = useCallback(async (item: RegisteredPackage, preferredChapterId?: string) => {
    if (item.id === selectedPackageId && !preferredChapterId) return;
    setSelectedPackageId(item.id);
    setEditorTabs(createEditorTabsState());
    await store.loadPackageByPath(item.path, preferredChapterId);
    // Persist last-opened package so it can be restored on next launch.
    if (workspaceDir) {
      void window.learnlab.database.setWorkspaceSetting(workspaceDir, 'last_package_id', item.id).catch(() => undefined);
    }
  }, [selectedPackageId, store.loadPackageByPath, workspaceDir]);

  const activateTab = useCallback((tabId: string) => {
    const tab = editorTabs.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    setEditorTabs((state) => activateEditorTab(state, tabId));
    if (tab.kind === 'chapter' && tab.packageId === selectedPackageId) void store.selectChapter(tab.chapterId);
  }, [editorTabs.tabs, selectedPackageId, store.selectChapter]);

  const closeTab = useCallback((tabId: string) => {
    const closingActiveTab = editorTabs.activeTabId === tabId;
    const nextState = closeEditorTab(editorTabs, tabId);
    setEditorTabs(nextState);
    if (!closingActiveTab) return;
    const nextTab = nextState.tabs.find((item) => item.id === nextState.activeTabId);
    if (nextTab?.kind === 'chapter' && nextTab.packageId === selectedPackageId) void store.selectChapter(nextTab.chapterId);
  }, [editorTabs, selectedPackageId, store.selectChapter]);

  const jumpToHeading = useCallback((headingId: string) => {
    document.getElementById(headingId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const describeImportError = useCallback((error: { type: string; message: string }) => {
    switch (error.type) {
      case 'manifest_invalid':
        return `实验包的 manifest 或章节无效：${error.message}`;
      case 'package_already_registered':
        return '学习区里已经有同一个实验包，没有重复导入。';
      case 'name_conflict':
        return `学习区里已有同名的另一个实验包：${error.message}`;
      case 'outside_workspace':
        return '实验包目录必须位于学习区内，请通过“导入实验包”复制进来。';
      case 'symlink_not_allowed':
        return '不支持软连接形式的实验包，请选择真实目录。';
      case 'package_not_found':
        return `找不到可读取的实验包目录：${error.message}`;
      default:
        return error.message;
    }
  }, []);

  const finishImport = useCallback(async (dir: string, registered: RegisteredPackage) => {
    const packages = await window.learnlab.workspace.listPackages(dir);
    setWorkspacePackages(packages);
    setSelectedPackageId(registered.id);
    setEditorTabs(createEditorTabsState());
    await store.loadPackageByPath(registered.path);
    notify({ level: 'info', title: '实验包已导入', message: `${registered.name} 已复制到学习区并登记。` });
  }, [store.loadPackageByPath, notify]);

  const importPackage = useCallback(async () => {
    if (!workspaceDir || importing) return;
    setImporting(true);
    try {
      const outcome = await window.learnlab.workspace.importPackage(workspaceDir);
      if (outcome.canceled) return;
      if (!outcome.result.ok) {
        notify({ level: 'error', title: '导入实验包失败', message: describeImportError(outcome.result.error) });
        return;
      }
      await finishImport(workspaceDir, outcome.result.value);
    } catch (cause) {
      notify({ level: 'error', title: '导入实验包失败', message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setImporting(false);
    }
  }, [workspaceDir, importing, notify, describeImportError, finishImport]);

  const importExample = useCallback(async () => {
    if (!workspaceDir || importing) return;
    setImporting(true);
    try {
      const result = await window.learnlab.workspace.importExample(workspaceDir);
      if (!result.ok) {
        notify({ level: 'error', title: '导入示例包失败', message: describeImportError(result.error) });
        return;
      }
      await finishImport(workspaceDir, result.value);
    } catch (cause) {
      notify({ level: 'error', title: '导入示例包失败', message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setImporting(false);
    }
  }, [workspaceDir, importing, notify, describeImportError, finishImport]);

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
          hasDocument={Boolean(editorTabs.activeTabId && store.markdown)}
          findIndex={store.findIndex}
          findTotal={store.findTotal}
          onQueryChange={store.setSearchQuery}
          onToggleOption={store.toggleSearchOption}
          onStep={store.stepFind}
        />
      );
      break;
    case 'experiments':
      sidebar = <ExperimentList chapter={store.activeChapter} parsed={store.experiments} readonlyStatus={store.readonlyStatus} onOpenExperiment={openExperimentTab} />;
      break;
    case 'plugins':
      sidebar = <PluginList plugins={catalog.plugins} loadedCount={store.loadedPluginCount} loading={catalog.loading} error={catalog.errors.plugins} />;
      break;
    case 'dependencies':
      sidebar = <DependencyList dependencies={catalog.dependencies} prerequisites={catalog.prerequisites} loading={catalog.loading} dependencyError={catalog.errors.dependencies} prerequisiteError={catalog.errors.prerequisites} />;
      break;
    case 'workspace':
      sidebar = (
        <WorkspacePackageList
          packages={workspacePackages}
          selectedPackageId={selectedPackageId}
          importing={importing}
          exampleAvailable={exampleAvailable}
          onSelectPackage={(item) => { void switchPackage(item); }}
          onImportPackage={() => { void importPackage(); }}
          onImportExample={() => { void importExample(); }}
        />
      );
      break;
    case 'explorer':
      sidebar = <FileExplorer packageName={store.packageName} chapters={store.chapters} activeChapterId={store.activeChapterId} onSelectChapter={openChapterTab} />;
      break;
  }

  const activeTab = editorTabs.tabs.find((tab) => tab.id === editorTabs.activeTabId);
  const editor = activeTab?.kind === 'experiment' ? (
    <ExperimentView experiment={activeTab.experiment} readonlyStatus={store.readonlyStatus} packageDir={store.packageDir || ''} />
  ) : editorTabs.activeTabId ? (
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
      findQuery={store.searchQuery}
      findOptions={store.searchOptions}
      findIndex={store.findIndex}
      onFindTotal={store.reportFindTotal}
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
