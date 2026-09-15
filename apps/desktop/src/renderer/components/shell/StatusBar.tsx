export interface StatusBarProps {
	progress: number;
	pluginCount: number;
	unreadMessages: number;
	onTogglePanel: () => void;
	onShowPlugins: () => void;
	onToggleNotifications: () => void;
	notificationCenterVisible: boolean;
}

export function StatusBar({
	progress,
	pluginCount,
	unreadMessages,
	onTogglePanel,
	onShowPlugins,
	onToggleNotifications,
	notificationCenterVisible
}: StatusBarProps) {
	return (
		<footer class="workbench-status-bar">
			<div class="workbench-status-group">
				<span>阅读进度 {progress}%</span>
				<button type="button" onClick={onShowPlugins}>已加载插件 {pluginCount}</button>
			</div>
			<div class="workbench-status-group">
				<button type="button" onClick={onTogglePanel}>输出</button>
				<button
					type="button"
					class="workbench-status-notification"
					onClick={onToggleNotifications}
					aria-label={unreadMessages ? `${unreadMessages} 条未预览消息` : '通知中心'}
					aria-expanded={notificationCenterVisible}
					title={unreadMessages ? `${unreadMessages} 条未预览消息` : '通知中心'}
				>
					<span aria-hidden="true">◌</span>{unreadMessages > 0 && <span>{unreadMessages}</span>}
				</button>
			</div>
		</footer>
	);
}
