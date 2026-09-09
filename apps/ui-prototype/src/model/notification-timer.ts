import type { NotificationEntry } from './workbench';

export const INFO_LIFETIME_MS = 8000;

export function scheduleNotificationExpiry(
  notification: NotificationEntry,
  expire: () => void
): () => void {
  if (notification.level !== 'info' || !notification.toastVisible) return () => {};
  const remaining = Math.max(0, INFO_LIFETIME_MS - (Date.now() - notification.createdAt));
  const timer = setTimeout(expire, remaining);
  return () => clearTimeout(timer);
}
