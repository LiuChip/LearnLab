import type { ComponentChildren } from 'preact';
import type { WorkbenchActivityId } from '../../utils/workbench';
import { WORKBENCH_ACTIVITY_LABELS } from '../../utils/workbench';

interface PrimarySidebarProps {
	activeActivity: WorkbenchActivityId;
	children: ComponentChildren;
	onClose: () => void;
}

export function PrimarySidebar({ activeActivity, children, onClose }: PrimarySidebarProps) {
	return (
		<aside class="workbench-primary-sidebar" aria-label="主侧边栏">
			<header class="workbench-sidebar-header">
				<span>{WORKBENCH_ACTIVITY_LABELS[activeActivity]}</span>
				<button type="button" class="workbench-icon-button" title="隐藏主侧栏" aria-label="隐藏主侧栏" onClick={onClose}>
					×
				</button>
			</header>
			<div class="workbench-sidebar-content">{children}</div>
		</aside>
	);
}
