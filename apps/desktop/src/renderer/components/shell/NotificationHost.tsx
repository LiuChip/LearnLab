import type { PluginPermissionDecision, PluginPermissionRequest } from '@learnlab/core-types';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { NotificationEntry } from '../../stores/workbenchStore';
import { INFO_NOTIFICATION_PROGRESS_MS, scheduleNotificationExpiry } from '../../stores/notificationTimer';

type RespondToPermission = (requestId: string, decision: PluginPermissionDecision) => Promise<void>;

const PERMISSION_STATUS_LABELS = {
  closed: '权限请求已关闭',
  denied: '权限请求已拒绝',
  once: '已选择单次允许',
  always: '已选择始终允许'
};

const PERMISSION_GROUPS = [
  ['read', '读取'],
  ['write', '写入'],
  ['execute', '执行']
] as const;

function PermissionPrompt({ request, onRespond }: {
  request: PluginPermissionRequest;
  onRespond: RespondToPermission;
}) {
  const [allowMenuOpen, setAllowMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const allowButton = useRef<HTMLButtonElement>(null);

  async function respond(decision: PluginPermissionDecision) {
    setAllowMenuOpen(false);
    setSubmitting(true);
    try {
      await onRespond(request.requestId, decision);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <strong class="workbench-permission-warning">
        此插件将以当前用户权限运行原生 JavaScript，可直接访问文件系统、启动子进程并访问网络。
      </strong>
      <div class="workbench-permission-scope">
        <div>实验包：{request.packageName}</div>
        <div>实验：{request.experimentTitle}</div>
        {PERMISSION_GROUPS.map(([scope, label]) => {
          const resources = request.permissions[scope];
          return resources?.length ? <div key={scope}>{label}：{resources.join('、')}</div> : null;
        })}
        <div>始终允许会为此实验包记住对此插件版本及所列权限的授权。</div>
      </div>
      <div class="workbench-permission-actions">
        <button type="button" disabled={submitting} onClick={() => void respond('denied')}>拒绝</button>
        <div
          class="workbench-permission-menu"
          onFocusOut={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAllowMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (allowMenuOpen && event.key === 'Escape') {
              event.stopPropagation();
              setAllowMenuOpen(false);
              allowButton.current?.focus();
            }
          }}
        >
          <button
            ref={allowButton}
            type="button"
            class="workbench-permission-allow"
            aria-expanded={allowMenuOpen}
            disabled={submitting}
            onClick={() => setAllowMenuOpen((open) => !open)}
          >
            允许 <span aria-hidden="true">⌄</span>
          </button>
          {allowMenuOpen && (
            <div class="workbench-permission-options">
              <button type="button" onClick={() => void respond('once')}>单次允许</button>
              <button type="button" onClick={() => void respond('always')}>始终允许</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface NotificationItemProps {
  notification: NotificationEntry;
  center?: boolean;
  onExpire: (id: string) => void;
  onDismiss: (id: string) => void;
  onRespondToPermission: RespondToPermission;
}

function NotificationItem({
  notification, center = false, onExpire, onDismiss, onRespondToPermission
}: NotificationItemProps) {
  const permission = notification.permission;
  const pending = permission?.status === 'pending';
  const elapsedAtMount = useRef(
    Math.min(INFO_NOTIFICATION_PROGRESS_MS, Math.max(0, Date.now() - notification.createdAt))
  );

  useEffect(() => {
    if (center) return;
    return scheduleNotificationExpiry(notification, () => onExpire(notification.id));
  }, [notification.id, notification.createdAt, notification.level, notification.toastVisible, center, onExpire]);

  return (
    <article class={`${center ? 'workbench-notification-center-item' : 'workbench-notification'} is-${notification.level}${pending ? ' is-permission-pending' : ''}`}>
      <span class="workbench-notification-mark" aria-hidden="true">
        {notification.level === 'info' ? 'i' : '!'}
      </span>
      <div class="workbench-notification-copy">
        <strong>{notification.title}</strong>
        <p>{notification.message}</p>
        {permission && (permission.status === 'pending'
          ? <PermissionPrompt request={permission.request} onRespond={onRespondToPermission} />
          : <p>{PERMISSION_STATUS_LABELS[permission.status]}</p>)}
      </div>
      {(!center || !pending) && (
        <button
          type="button"
          class="workbench-notification-close"
          title="关闭通知"
          aria-label={`关闭${notification.title}`}
          onClick={() => onDismiss(notification.id)}
        >
          ×
        </button>
      )}
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
  onRespondToPermission: RespondToPermission;
}

export function NotificationHost({
  notifications,
  centerVisible,
  onToggleCenter,
  onExpire,
  onDismiss,
  onClear,
  onRespondToPermission
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
            onRespondToPermission={onRespondToPermission}
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
          <button
            type="button"
            class="workbench-icon-button"
            disabled={!notifications.some((item) => item.permission?.status !== 'pending')}
            onClick={onClear}
            title="清空通知"
          >≡×</button>
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
            onRespondToPermission={onRespondToPermission}
          />
        ))}
      </div>
    </section>
  );
}
