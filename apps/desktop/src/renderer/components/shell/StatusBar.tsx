export interface StatusBarProps {
	progress: number;
	pluginCount: number;
	unreadMessages: number;
	onTogglePanel: () => void;
}

export function StatusBar({ progress, pluginCount, unreadMessages, onTogglePanel }: StatusBarProps) {
	return (
		<footer class="workbench-status-bar">
			<div class="workbench-status-group">
				<span>阅读进度 {progress}%</span>
				<span>已加载插件 {pluginCount}</span>
			</div>
			<div class="workbench-status-group">
				<button type="button" onClick={onTogglePanel}>输出</button>
				<span aria-label="未预览消息">未预览消息 {unreadMessages}</span>
			</div>
		</footer>
	);
}
