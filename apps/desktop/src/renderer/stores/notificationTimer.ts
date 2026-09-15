import type { NotificationLevel } from './workbenchStore';

interface ExpiringNotification {
  level: NotificationLevel;
  toastVisible: boolean;
  createdAt: number;
}

export const INFO_NOTIFICATION_DURATION_MS = 8000;
export const INFO_NOTIFICATION_PROGRESS_MS = 7000;

export function scheduleNotificationExpiry(
  notification: ExpiringNotification,
  onExpire: () => void
): () => void {
  if (notification.level !== 'info' || !notification.toastVisible) return () => undefined;
  const remaining = Math.max(
    0,
    INFO_NOTIFICATION_DURATION_MS - (Date.now() - notification.createdAt)
  );
  const timer = setTimeout(onExpire, remaining);
  return () => clearTimeout(timer);
}
