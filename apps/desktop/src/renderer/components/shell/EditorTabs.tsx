import type { EditorTab } from '../../stores/tabStore';

interface EditorTabsProps {
	tabs: EditorTab[];
	activeTabId: string | null;
	onActivate: (tabId: string) => void;
	onClose: (tabId: string) => void;
}

export function EditorTabs({ tabs, activeTabId, onActivate, onClose }: EditorTabsProps) {
	return (
		<div class="workbench-editor-tabs" role="tablist" aria-label="编辑器标签页">
			{tabs.map((tab) => (
				<div key={tab.id} class={`workbench-editor-tab${tab.id === activeTabId ? ' is-active' : ''}`} role="presentation">
					<button
						type="button"
							role="tab"
							aria-selected={tab.id === activeTabId}
							onClick={() => onActivate(tab.id)}
						>
							<span class="workbench-tab-file-type" aria-hidden="true">M↓</span>
							{tab.title}
						</button>
						<button type="button" class="workbench-editor-tab-close" aria-label={`关闭${tab.title}`} onClick={() => onClose(tab.id)}>
							×
						</button>
				</div>
			))}
		</div>
	);
}
