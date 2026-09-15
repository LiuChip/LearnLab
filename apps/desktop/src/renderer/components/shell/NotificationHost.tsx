import { useEffect, useRef } from 'preact/hooks';
import type { NotificationEntry } from '../../stores/workbenchStore';
import { INFO_NOTIFICATION_PROGRESS_MS, scheduleNotificationExpiry } from '../../stores/notificationTimer';

interface NotificationItemProps {
  notification: NotificationEntry;
  center?: boolean;
  onExpire: (id: string) => void;
  onDismiss: (id: string) => void;
}

function NotificationItem({ notification, center = false, onExpire, onDismiss }: NotificationItemProps) {
  const elapsedAtMount = useRef(
    Math.min(INFO_NOTIFICATION_PROGRESS_MS, Math.max(0, Date.now() - notification.createdAt))
  );

  useEffect(() => {
    if (center) return;
    return scheduleNotificationExpiry(notification, () => onExpire(notification.id));
  }, [notification.id, notification.level, notification.toastVisible, center, onExpire]);

  return (
    <article class={`${center ? 'workbench-notification-center-item' : 'workbench-notification'} is-${notification.level}`}>
      <span class="workbench-notification-mark" aria-hidden="true">
        {notification.level === 'info' ? 'i' : '!'}
      </span>
      <div class="workbench-notification-copy">
        <strong>{notification.title}</strong>
        <p>{notification.message}</p>
      </div>
      <button
        type="button"
        class="workbench-notification-close"
        title="关闭通知"
        aria-label={`关闭${notification.title}`}
        onClick={() => onDismiss(notification.id)}
      >
        ×
      </button>
      {!center && notification.level === 'info' && (
        <div
          class="workbench-notification-progress"
          style={{ animationDelay: `-${elapsedAtMount.current}ms` }}
        />
      )}
    </article>
  );
}

interface NotificationHostProps {
  notifications: NotificationEntry[];
  centerVisible: boolean;
  onToggleCenter: () => void;
  onExpire: (id: string) => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
}

export function NotificationHost({
  notifications,
  centerVisible,
  onToggleCenter,
  onExpire,
  onDismiss,
  onClear
}: NotificationHostProps) {
  useEffect(() => {
    if (!centerVisible) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggleCenter();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [centerVisible, onToggleCenter]);

  if (!centerVisible) {
    return (
      <div class="workbench-notification-host" aria-live="polite">
        {notifications.filter((item) => item.toastVisible).map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onExpire={onExpire}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    );
  }

  return (
    <section class="workbench-notification-center" role="dialog" aria-label="通知中心">
      <header>
        <strong>{notifications.length ? '通知' : '无通知'}</strong>
        <div>
          <button type="button" class="workbench-icon-button" disabled={!notifications.length} onClick={onClear} title="清空通知">≡×</button>
          <button type="button" class="workbench-icon-button" onClick={onToggleCenter} title="关闭通知中心">×</button>
        </div>
      </header>
      <div class="workbench-notification-center-list">
        {[...notifications].reverse().map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            center
            onExpire={onExpire}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </section>
  );
}
