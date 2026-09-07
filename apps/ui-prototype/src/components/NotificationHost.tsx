import type { WorkbenchAction, WorkbenchState } from '../model/workbench';
import { Icon } from './Icon';

export function NotificationHost({ state, dispatch }: { state: WorkbenchState; dispatch: (action: WorkbenchAction) => void }) {
  return <div class="notification-host" aria-live="polite">{state.notifications.map((notification) => <article class={`notification notification-${notification.level}`} key={notification.id}><div class="notification-mark"><Icon glyph={notification.level === 'info' ? 'i' : notification.level === 'warning' ? '!' : '×'} /></div><div class="notification-copy"><strong>{notification.title}</strong><p>{notification.message}</p></div><button class="notification-close" type="button" onClick={() => dispatch({ type: 'dismissNotification', notificationId: notification.id })} aria-label={`关闭${notification.title}`}>×</button>{notification.progress ? <div class="notification-progress" /> : null}</article>)}</div>;
}
