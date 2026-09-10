import {
	WORKBENCH_ACTIVITY_IDS,
	WORKBENCH_ACTIVITY_LABELS,
	type WorkbenchActivityId
} from '../../utils/workbench';

const glyphs: Record<WorkbenchActivityId, string> = {
	chapters: '章',
	search: '搜',
	experiments: '验',
	plugins: '插',
	dependencies: '依',
	workspace: '包',
	explorer: '文'
};

interface ActivityBarProps {
	activeActivity: WorkbenchActivityId;
	primaryVisible: boolean;
	onSelect: (activity: WorkbenchActivityId) => void;
}

export function ActivityBar({ activeActivity, primaryVisible, onSelect }: ActivityBarProps) {
	return (
		<nav class="workbench-activity-bar" aria-label="功能栏">
			<div class="workbench-activity-stack">
				{WORKBENCH_ACTIVITY_IDS.map((activity) => {
					const label = WORKBENCH_ACTIVITY_LABELS[activity];
					return (
						<button
							key={activity}
							type="button"
							class={`workbench-activity-button${primaryVisible && activeActivity === activity ? ' is-active' : ''}`}
							aria-label={label}
							aria-pressed={primaryVisible && activeActivity === activity}
							title={label}
							onClick={() => onSelect(activity)}
						>
							<span aria-hidden="true">{glyphs[activity]}</span>
						</button>
					);
				})}
			</div>
			<button type="button" class="workbench-activity-button is-muted" disabled aria-label="设置">
				<span aria-hidden="true">设</span>
			</button>
		</nav>
	);
}
