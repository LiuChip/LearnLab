import type { ComponentChildren } from 'preact';
import { ActivityBar } from './ActivityBar';
import { BottomPanel } from './BottomPanel';
import { EditorGroup } from './EditorGroup';
import { PrimarySidebar } from './PrimarySidebar';
import { StatusBar } from './StatusBar';
import type { WorkbenchActivityId } from '../../utils/workbench';

interface AppShellProps {
	packageName: string;
	packageVersion?: string;
	activeActivity: WorkbenchActivityId;
	primaryVisible: boolean;
	bottomPanelVisible: boolean;
	progress: number;
	pluginCount: number;
	unreadMessages: number;
	onActivityChange: (activity: WorkbenchActivityId) => void;
	onTogglePrimary: () => void;
	onToggleBottomPanel: () => void;
	sidebar: ComponentChildren;
	editor: ComponentChildren;
}

export function AppShell({
	packageName,
	packageVersion,
	activeActivity,
	primaryVisible,
	bottomPanelVisible,
	progress,
	pluginCount,
	unreadMessages,
	onActivityChange,
	onTogglePrimary,
	onToggleBottomPanel,
	sidebar,
	editor
}: AppShellProps) {
	return (
		<main class="workbench-shell">
			<header class="workbench-menubar">
				<strong class="workbench-brand"><span aria-hidden="true">L</span> LearnLab</strong>
				<nav aria-label="应用菜单" class="workbench-menu-items">
					{['文件', '编辑', '查看', '转到', '运行', '窗口', '帮助'].map((item) => (
						<button key={item} type="button" title={`${item}菜单占位`}>{item}</button>
					))}
				</nav>
				<span class="workbench-window-context">{packageName}{packageVersion ? ` · ${packageVersion}` : ''}</span>
			</header>
			<header class="workbench-command-center">
				<button type="button" class="workbench-context-button" onClick={onTogglePrimary}>
					{packageName || '未选择学习区'}
				</button>
				<span class="workbench-command-placeholder">⌕ 快速打开章节（占位）</span>
				<button type="button" class="workbench-ghost-button" onClick={onTogglePrimary}>
					{primaryVisible ? '隐藏侧栏' : '显示侧栏'}
				</button>
			</header>
			<div class="workbench-body">
				<ActivityBar
					activeActivity={activeActivity}
					primaryVisible={primaryVisible}
					onSelect={onActivityChange}
				/>
				{primaryVisible && <PrimarySidebar activeActivity={activeActivity}>{sidebar}</PrimarySidebar>}
				<div class="workbench-center-column">
					<EditorGroup>{editor}</EditorGroup>
					<BottomPanel visible={bottomPanelVisible} onToggle={onToggleBottomPanel} />
				</div>
				<aside class="workbench-auxiliary-sidebar" aria-label="辅助侧栏">
					<header>辅助视图</header>
					<div>AI、诊断和其他辅助插件将在后续接入。</div>
				</aside>
			</div>
			<StatusBar
				progress={progress}
				pluginCount={pluginCount}
				unreadMessages={unreadMessages}
				onTogglePanel={onToggleBottomPanel}
			/>
		</main>
	);
}
