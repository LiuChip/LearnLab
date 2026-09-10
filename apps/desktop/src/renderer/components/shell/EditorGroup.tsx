import type { ComponentChildren } from 'preact';

export function EditorGroup({ children }: { children: ComponentChildren }) {
	return (
		<section class="workbench-editor-group" aria-label="中央主窗口">
			<div class="workbench-editor-tabs" role="tablist" aria-label="编辑器标签页">
				<button type="button" class="workbench-editor-tab is-active" role="tab" aria-selected="true">
					<span aria-hidden="true">文</span>
					当前章节
				</button>
			</div>
			<div class="workbench-editor-area">{children}</div>
		</section>
	);
}
