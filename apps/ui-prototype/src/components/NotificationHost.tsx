import { useEffect, useRef, useState } from 'preact/hooks';
import type { NotificationEntry, WorkbenchAction, WorkbenchState } from '../model/workbench';
import { scheduleNotificationExpiry } from '../model/notification-timer';

type Dispatch = (action: WorkbenchAction) => void;

function NotificationItem({
  notification,
  dispatch,
  center = false
}: {
  notification: NotificationEntry;
  dispatch: Dispatch;
  center?: boolean;
}) {
  const [allowMenuOpen, setAllowMenuOpen] = useState(false);
  const permission = notification.permissionRequest;
  const pending = permission?.status === 'pending';
  const elapsedAtMount = useRef(Math.min(7000, Math.max(0, Date.now() - notification.createdAt)));
  useEffect(() => {
    if (center) return;
    return scheduleNotificationExpiry(notification, () =>
      dispatch({ type: 'expireNotification', notificationId: notification.id })
    );
  }, [
    notification.id,
    notification.createdAt,
    notification.level,
    notification.toastVisible,
    center,
    dispatch
  ]);

  return (
    <article
      class={`${center ? 'notification-center-item' : 'notification'} notification-${notification.level}${permission ? ' notification-permission' : ''}`}
    >
      <span class="notification-mark" aria-hidden="true">{notification.level === 'info' ? 'i' : '!'}</span>
      <div class="notification-copy">
        <strong>{notification.title}</strong>
        <p>{notification.message}</p>
        {permission && (
          pending ? (
            <div class="notification-permission-scope">
              <div>读取：{permission.read}</div>
              <div>执行：{permission.execute}</div>
            </div>
          ) : <p>权限请求已{permission.status === 'denied' ? '拒绝' : permission.status === 'once' ? '单次允许' : '始终允许'}</p>
        )}
        {pending && (
          <div class="notification-permission-actions">
            <button type="button" onClick={() => dispatch({ type: 'resolvePermissionRequest', notificationId: notification.id, decision: 'denied' })}>拒绝</button>
            <div class="notification-allow-menu">
              <button type="button" class="notification-allow" aria-expanded={allowMenuOpen} onClick={() => setAllowMenuOpen(!allowMenuOpen)}>允许 <span aria-hidden="true">⌄</span></button>
              {allowMenuOpen && (
                <div class="notification-allow-options" role="menu">
                  <button type="button" role="menuitem" onClick={() => dispatch({ type: 'resolvePermissionRequest', notificationId: notification.id, decision: 'once' })}>单次允许</button>
                  <button type="button" role="menuitem" onClick={() => dispatch({ type: 'resolvePermissionRequest', notificationId: notification.id, decision: 'always' })}>始终允许</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {(!center || !pending) && <button
        class="notification-close"
        title="关闭通知"
        aria-label={`关闭${notification.title}`}
        onClick={() => dispatch({ type: 'dismissNotification', notificationId: notification.id })}
      >
        ×
      </button>}
      {!center && notification.level === 'info' ? (
        <div
          class="notification-progress"
          style={{ animationDelay: `-${elapsedAtMount.current}ms` }}
        />
      ) : null}
    </article>
  );
}

export function NotificationHost({
  state,
  dispatch
}: {
  state: WorkbenchState;
  dispatch: Dispatch;
}) {
  useEffect(() => {
    if (!state.notificationCenterVisible) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'toggleNotificationCenter' });
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [state.notificationCenterVisible, dispatch]);

  return (
    <>
      {!state.notificationCenterVisible && (
        <div class="notification-host" aria-live="polite">
          {state.notifications
            .filter((item) => item.toastVisible)
            .map((notification) => (
              <NotificationItem
                key={`${notification.id}:${notification.createdAt}`}
                notification={notification}
                dispatch={dispatch}
              />
            ))}
        </div>
      )}
      {state.notificationCenterVisible && (
        <section class="notification-center" role="dialog" aria-label="通知中心">
          <header class="notification-center-header">
            <strong>{state.notifications.length ? '通知' : '无新通知'}</strong>
            <div>
              <button
                class="ghost-button"
                title="清空通知"
                aria-label="清空通知"
                disabled={!state.notifications.some((item) => item.permissionRequest?.status !== 'pending')}
                onClick={() => dispatch({ type: 'clearNotifications' })}
              >
                ≡×
              </button>
              <button
                class="ghost-button"
                title="隐藏通知中心"
                aria-label="关闭通知中心"
                onClick={() => dispatch({ type: 'toggleNotificationCenter' })}
              >
                ⌄
              </button>
            </div>
          </header>
          <div class="notification-center-list">
            {[...state.notifications].reverse().map((notification) => (
              <NotificationItem
                key={`${notification.id}:${notification.createdAt}`}
                notification={notification}
                dispatch={dispatch}
                center
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
