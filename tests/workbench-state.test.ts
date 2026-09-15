import { describe, expect, it } from 'vitest';
import {
  addNotification,
  createWorkbenchState,
  expireNotification,
  selectActivity,
  toggleNotificationCenter
} from '../apps/desktop/src/renderer/stores/workbenchStore';

describe('desktop workbench state', () => {
  it('toggles the primary sidebar when the active Activity Bar item is selected again', () => {
    const initial = createWorkbenchState();
    const hidden = selectActivity(initial, 'chapters');
    const search = selectActivity(hidden, 'search');

    expect(hidden.primaryVisible).toBe(false);
    expect(search.primaryVisible).toBe(true);
    expect(search.activeActivity).toBe('search');
  });

  it('opens the notification center without changing bottom panel state', () => {
    const initial = { ...createWorkbenchState(), bottomPanelVisible: true };
    const opened = toggleNotificationCenter(initial);

    expect(opened.notificationCenterVisible).toBe(true);
    expect(opened.bottomPanelVisible).toBe(true);
  });

  it('keeps expired info in notification history while hiding only its toast', () => {
    const first = addNotification(createWorkbenchState(), {
      level: 'info',
      title: '实验包已载入',
      message: '正文可以阅读。'
    });
    const second = addNotification(first, {
      level: 'info',
      title: '搜索完成',
      message: '找到 2 处匹配。'
    });
    const expired = expireNotification(second, first.notifications[0].id);

    expect(expired.notifications).toHaveLength(2);
    expect(expired.notifications[0].toastVisible).toBe(false);
    expect(expired.notifications[1].toastVisible).toBe(true);
  });
});
