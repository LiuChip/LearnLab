import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import {
  allChapters,
  createInitialState,
  experiments,
  workbenchReducer,
  type WorkbenchAction
} from '../model/workbench';
import { ActivityBar } from './ActivityBar';
import { PrimarySidebar } from './PrimarySidebar';
import { EditorArea } from './EditorArea';
import { AuxiliarySidebar } from './AuxiliarySidebar';
import { BottomPanel } from './BottomPanel';
import { NotificationHost } from './NotificationHost';
import { ResizeHandle } from './ResizeHandle';

function ExperimentTimer({
  id,
  running,
  dispatch
}: {
  id: string;
  running: boolean;
  dispatch: (action: WorkbenchAction) => void;
}) {
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'markExperimentPassed', experimentId: id }),
      1100
    );
    return () => window.clearTimeout(timer);
  }, [id, running, dispatch]);
  return null;
}

export function Workbench() {
  const [state, dispatch] = useReducer(workbenchReducer, undefined, () => ({
    ...createInitialState(),
    primaryVisible: window.innerWidth >= 600,
    auxiliaryVisible: window.innerWidth >= 1100
  }));
  const [primaryWidth, setPrimaryWidth] = useState(260);
  const [auxiliaryWidth, setAuxiliaryWidth] = useState(300);
  const [panelHeight, setPanelHeight] = useState(220);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const quickInput = useRef<HTMLInputElement>(null);
  const activeTab = state.editorTabs.find((tab) => tab.id === state.activeTabId);
  const progress =
    activeTab?.kind === 'document'
      ? Math.round((state.readingProgress[activeTab.chapterId!] ?? 0) * 100)
      : null;
  const quickResults = allChapters.filter((node) =>
    node.label.toLowerCase().includes(quickQuery.toLowerCase())
  );
  useEffect(() => {
    if (quickOpen) quickInput.current?.focus();
  }, [quickOpen]);
  const openChapter = (id: string) => {
    dispatch({ type: 'selectChapter', chapterId: id });
    setQuickOpen(false);
    setQuickQuery('');
  };
  const toggleAuxiliary = () => {
    if (window.innerWidth < 600 && state.primaryVisible) dispatch({ type: 'togglePrimary' });
    dispatch({ type: 'toggleAuxiliary' });
  };
  const sidebarDispatch = (action: WorkbenchAction) => {
    dispatch(action);
    if (
      window.innerWidth < 600 &&
      ['selectChapter', 'openExperiment', 'openDetail', 'openSearchMatch'].includes(action.type)
    )
      dispatch({ type: 'togglePrimary' });
  };

  return (
    <main
      class={`prototype-window theme-${state.theme}${state.primaryVisible ? ' primary-open' : ''}${state.auxiliaryVisible ? ' auxiliary-open' : ''}`}
      style={{
        '--primary-width': `${primaryWidth}px`,
        '--auxiliary-width': `${auxiliaryWidth}px`,
        '--panel-height': `${panelHeight}px`
      }}
    >
      <div class="menubar">
        <div class="product-name">
          <span class="product-mark">L</span>
          <strong>LearnLab</strong>
        </div>
        <div class="menu-items">
          {['文件', '编辑', '选择', '查看', '转到', '运行', '窗口', '帮助'].map((label) => (
            <button type="button" key={label} title={`${label}（菜单占位）`}>
              {label}
            </button>
          ))}
        </div>
        <span class="menubar-spacer" />
        <span class="window-context">SQL 基础 · LearnLab</span>
        {['最小化', '最大化', '关闭'].map((label, index) => (
          <button
            key={label}
            class={`window-button${index === 2 ? ' close-button' : ''}`}
            title={`${label}（窗口控件占位）`}
            aria-label={label}
          >
            <span
              class={`window-control-glyph window-control-${['minimize', 'maximize', 'close'][index]}`}
            />
          </button>
        ))}
      </div>
      <header class="command-bar">
        <div class="command-context">
          <span class="context-crumb">
            SQL 基础 <span class="crumb-muted">sql-intro@1.2.0</span>
          </span>
        </div>
        <button
          class="command-center"
          onClick={() => setQuickOpen(true)}
          title="快速打开章节"
          aria-label="快速打开章节"
        >
          <span aria-hidden="true">⌕</span>
          <span>搜索章节</span>
        </button>
        <div class="command-actions">
          <button
            title={state.auxiliaryVisible ? '隐藏辅助栏' : '显示辅助栏'}
            aria-label="切换辅助栏"
            aria-pressed={state.auxiliaryVisible}
            onClick={toggleAuxiliary}
          >
            ▯
          </button>
          <button
            title="切换主题"
            aria-label="切换主题"
            onClick={() =>
              dispatch({ type: 'setTheme', theme: state.theme === 'dark' ? 'light' : 'dark' })
            }
          >
            ◐
          </button>
        </div>
      </header>
      <div class="workbench-body">
        <ActivityBar state={state} dispatch={dispatch} />
        {state.primaryVisible && (
          <div class="primary-region">
            <PrimarySidebar state={state} dispatch={sidebarDispatch} />
            <ResizeHandle
              label="主侧栏宽度"
              value={primaryWidth}
              min={220}
              max={400}
              onChange={setPrimaryWidth}
            />
          </div>
        )}
        <div class="center-column">
          <EditorArea state={state} dispatch={dispatch} />
          {state.bottomPanelVisible && (
            <div class="bottom-region">
              <ResizeHandle
                label="底部面板高度"
                value={panelHeight}
                min={120}
                max={420}
                onChange={setPanelHeight}
                horizontal
                reverse
              />
              <BottomPanel state={state} dispatch={dispatch} />
            </div>
          )}
        </div>
        {state.auxiliaryVisible && (
          <div class="auxiliary-region">
            <ResizeHandle
              label="辅助栏宽度"
              value={auxiliaryWidth}
              min={260}
              max={420}
              onChange={setAuxiliaryWidth}
              reverse
            />
            <AuxiliarySidebar state={state} dispatch={dispatch} />
          </div>
        )}
      </div>
      <footer class="status-bar">
        <div class="status-left">
          <span class="status-item">
            {progress === null ? '阅读进度 —' : `阅读进度 ${progress}%`}
          </span>
          <button
            class="status-item"
            onClick={() => dispatch({ type: 'setActivity', activity: 'plugins' })}
          >
            已加载插件 3
          </button>
        </div>
        <div class="status-center">
          <span class="status-item status-plugin-item">
            <span class="status-dot status-dot-green" />
            SQL Runner
          </span>
        </div>
        <div class="status-right">
          <button
            class="status-item"
            title="切换底部面板"
            aria-label="切换底部面板"
            aria-pressed={state.bottomPanelVisible}
            onClick={() => dispatch({ type: 'toggleBottomPanel' })}
          >
            终端 / 输出
          </button>
          <button
            class="status-item status-message"
            title={state.unreadMessages ? `${state.unreadMessages} 条未预览消息` : '无新通知'}
            aria-label="通知中心"
            aria-expanded={state.notificationCenterVisible}
            onClick={() => dispatch({ type: 'toggleNotificationCenter' })}
          >
            <span class="notification-bell" />
            {state.unreadMessages > 0 && <span>{state.unreadMessages}</span>}
          </button>
        </div>
      </footer>
      <NotificationHost state={state} dispatch={dispatch} />
      {experiments.map((experiment) => (
        <ExperimentTimer
          key={experiment.id}
          id={experiment.id}
          running={state.experimentStatus[experiment.id] === 'running'}
          dispatch={dispatch}
        />
      ))}
      {quickOpen && (
        <div
          class="quick-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setQuickOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuickOpen(false);
          }}
        >
          <section class="quick-open" role="dialog" aria-label="快速打开章节">
            <input
              ref={quickInput}
              value={quickQuery}
              placeholder="搜索章节"
              aria-label="章节名称"
              onInput={(event) => setQuickQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && quickResults[0]) openChapter(quickResults[0].id);
              }}
            />
            <div class="quick-results">
              {quickResults.map((node) => (
                <button key={node.id} onClick={() => openChapter(node.id)}>
                  <span>{node.label}</span>
                  <small>SQL 基础</small>
                </button>
              ))}
              {!quickResults.length && <p>没有匹配的章节</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
