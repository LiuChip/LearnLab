import type { ComponentChildren } from 'preact';
import { EditorTabs } from './EditorTabs';
import type { EditorTab } from '../../stores/tabStore';

interface EditorGroupProps {
	children: ComponentChildren;
	tabs: EditorTab[];
	activeTabId: string | null;
	onActivateTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
}

export function EditorGroup({ children, tabs, activeTabId, onActivateTab, onCloseTab }: EditorGroupProps) {
	return (
		<section class="workbench-editor-group" aria-label="中央主窗口">
			<EditorTabs tabs={tabs} activeTabId={activeTabId} onActivate={onActivateTab} onClose={onCloseTab} />
			<div class="workbench-editor-area">{children}</div>
		</section>
	);
}
