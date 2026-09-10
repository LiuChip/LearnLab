import type { ComponentChildren } from 'preact';
import type { WorkbenchActivityId } from '../../utils/workbench';
import { WORKBENCH_ACTIVITY_LABELS } from '../../utils/workbench';

interface PrimarySidebarProps {
	activeActivity: WorkbenchActivityId;
	children: ComponentChildren;
}

export function PrimarySidebar({ activeActivity, children }: PrimarySidebarProps) {
	return (
		<aside class="workbench-primary-sidebar" aria-label="主侧边栏">
			<header class="workbench-sidebar-header">
				<span>{WORKBENCH_ACTIVITY_LABELS[activeActivity]}</span>
				<button type="button" class="workbench-ghost-button" title="更多操作" aria-label="更多操作">
					…
				</button>
			</header>
			<div class="workbench-sidebar-content">{children}</div>
		</aside>
	);
}
