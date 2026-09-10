export function BottomPanel({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
	return (
		<section class={`workbench-bottom-panel${visible ? ' is-open' : ''}`} aria-label="底部面板">
			<header class="workbench-bottom-header">
				<div class="workbench-bottom-tabs" role="tablist" aria-label="底部面板标签">
					<button type="button" class="is-active" role="tab" aria-selected="true">输出</button>
					<button type="button" role="tab" aria-selected="false">实验历史</button>
					<button type="button" role="tab" aria-selected="false">问题</button>
				</div>
				<button type="button" class="workbench-ghost-button" onClick={onToggle} aria-label="收起底部面板">
					收起
				</button>
			</header>
			{visible && <div class="workbench-bottom-empty">运行输出和实验历史将在插件接入后显示。</div>}
		</section>
	);
}
