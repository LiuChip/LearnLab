import type { ComponentChildren } from 'preact';
import { ActivityBar } from './ActivityBar';
import { BottomPanel } from './BottomPanel';
import { EditorGroup } from './EditorGroup';
import { NotificationHost } from './NotificationHost';
import { PrimarySidebar } from './PrimarySidebar';
import { ResizeHandle } from './ResizeHandle';
import { StatusBar } from './StatusBar';
import type { EditorTab } from '../../stores/tabStore';
import type { BottomPanelId, NotificationEntry, WorkbenchTheme } from '../../stores/workbenchStore';
import type { WorkbenchActivityId } from '../../utils/workbench';

interface AppShellProps {
  packageName: string;
  packageVersion?: string;
  activeActivity: WorkbenchActivityId;
  primaryVisible: boolean;
  auxiliaryVisible: boolean;
  bottomPanelVisible: boolean;
  bottomPanel: BottomPanelId;
  theme: WorkbenchTheme;
  primaryWidth: number;
  auxiliaryWidth: number;
  bottomPanelHeight: number;
  progress: number;
  pluginCount: number;
  unreadMessages: number;
  notificationCenterVisible: boolean;
  notifications: NotificationEntry[];
  onActivityChange: (activity: WorkbenchActivityId) => void;
  onTogglePrimary: () => void;
  onToggleBottomPanel: () => void;
  onSelectBottomPanel: (panel: BottomPanelId) => void;
  onShowPlugins: () => void;
  onToggleNotifications: () => void;
  onExpireNotification: (id: string) => void;
  onDismissNotification: (id: string) => void;
  onClearNotifications: () => void;
  onQuickOpen: () => void;
  onResizePrimary: (value: number) => void;
  onResizeAuxiliary: (value: number) => void;
  onResizeBottomPanel: (value: number) => void;
  tabs: EditorTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  sidebar: ComponentChildren;
  editor: ComponentChildren;
  auxiliary: ComponentChildren;
}

export function AppShell(props: AppShellProps) {
  const style = {
    '--workbench-primary-width': `${props.primaryWidth}px`,
    '--workbench-auxiliary-width': `${props.auxiliaryWidth}px`,
    '--workbench-panel-height': `${props.bottomPanelHeight}px`
  } as Record<string, string>;

  return (
    <main class={`workbench-shell theme-${props.theme}`} style={style}>
      <header class="workbench-menubar">
        <strong class="workbench-brand"><span aria-hidden="true">L</span> LearnLab</strong>
        <nav aria-label="应用菜单" class="workbench-menu-items">
          {['文件', '编辑', '选择', '查看', '转到', '运行', '窗口', '帮助'].map((item) => (
            <button key={item} type="button" aria-disabled="true" title={`${item}菜单尚未接入`}>{item}</button>
          ))}
        </nav>
        <span class="workbench-window-context">
          {props.packageName}{props.packageVersion ? ` · ${props.packageVersion}` : ''}
        </span>
      </header>
      <header class="workbench-command-bar">
        <div class="workbench-command-context">
          <span>{props.packageName || '未选择实验包'}</span>
          {props.packageVersion && <small>{props.packageVersion}</small>}
        </div>
        <button type="button" class="workbench-command-center" onClick={props.onQuickOpen} title="快速打开章节">
          <span aria-hidden="true">⌕</span><span>搜索章节</span>
        </button>
        <span class="workbench-command-spacer" />
      </header>
      <div class="workbench-body">
        <ActivityBar activeActivity={props.activeActivity} primaryVisible={props.primaryVisible} onSelect={props.onActivityChange} />
        {props.primaryVisible && (
          <div class="workbench-primary-region">
            <PrimarySidebar activeActivity={props.activeActivity} onClose={props.onTogglePrimary}>{props.sidebar}</PrimarySidebar>
            <ResizeHandle label="主侧栏宽度" value={props.primaryWidth} min={220} max={420} onChange={props.onResizePrimary} />
          </div>
        )}
        <div class="workbench-center-column">
          <EditorGroup tabs={props.tabs} activeTabId={props.activeTabId} onActivateTab={props.onActivateTab} onCloseTab={props.onCloseTab}>
            {props.editor}
          </EditorGroup>
          {props.bottomPanelVisible && (
            <div class="workbench-bottom-region">
              <ResizeHandle label="底部面板高度" value={props.bottomPanelHeight} min={120} max={420} horizontal reverse onChange={props.onResizeBottomPanel} />
              <BottomPanel visible activePanel={props.bottomPanel} onSelectPanel={props.onSelectBottomPanel} onToggle={props.onToggleBottomPanel} />
            </div>
          )}
        </div>
        {props.auxiliaryVisible && (
          <div class="workbench-auxiliary-region">
            <ResizeHandle label="辅助栏宽度" value={props.auxiliaryWidth} min={240} max={420} reverse onChange={props.onResizeAuxiliary} />
            {props.auxiliary}
          </div>
        )}
      </div>
      <StatusBar
        progress={props.progress}
        pluginCount={props.pluginCount}
        unreadMessages={props.unreadMessages}
        onTogglePanel={props.onToggleBottomPanel}
        onShowPlugins={props.onShowPlugins}
        onToggleNotifications={props.onToggleNotifications}
        notificationCenterVisible={props.notificationCenterVisible}
      />
      <NotificationHost
        notifications={props.notifications}
        centerVisible={props.notificationCenterVisible}
        onToggleCenter={props.onToggleNotifications}
        onExpire={props.onExpireNotification}
        onDismiss={props.onDismissNotification}
        onClear={props.onClearNotifications}
      />
    </main>
  );
}
