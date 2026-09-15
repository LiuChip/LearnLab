import type { BottomPanelId } from '../../stores/workbenchStore';

const panels: Array<{ id: BottomPanelId; label: string }> = [
	{ id: 'output', label: '输出' },
	{ id: 'history', label: '实验历史' },
	{ id: 'problems', label: '问题' }
];

interface BottomPanelProps {
	visible: boolean;
	activePanel: BottomPanelId;
	onSelectPanel: (panel: BottomPanelId) => void;
	onToggle: () => void;
}

export function BottomPanel({ visible, activePanel, onSelectPanel, onToggle }: BottomPanelProps) {
	return (
		<section class={`workbench-bottom-panel${visible ? ' is-open' : ''}`} aria-label="底部面板">
			<header class="workbench-bottom-header">
				<div class="workbench-bottom-tabs" role="tablist" aria-label="底部面板标签">
					{panels.map((panel) => (
						<button
							type="button"
							class={panel.id === activePanel ? 'is-active' : ''}
							role="tab"
							aria-selected={panel.id === activePanel}
							onClick={() => onSelectPanel(panel.id)}
							key={panel.id}
						>
							{panel.label}
						</button>
					))}
				</div>
				<button type="button" class="workbench-icon-button" onClick={onToggle} aria-label="收起底部面板" title="收起底部面板">
					×
				</button>
			</header>
			{visible && (
				<div class="workbench-bottom-empty">
					{activePanel === 'output' && '尚无运行输出。插件执行宿主接入后将在这里显示受控输出。'}
					{activePanel === 'history' && '请选择实验后查看 experiment_history 中的运行记录。'}
					{activePanel === 'problems' && '当前没有诊断信息。'}
				</div>
			)}
		</section>
	);
}
