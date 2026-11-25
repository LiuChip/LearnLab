import { describe, expect, it } from 'vitest';
import type { PluginPermissionRequest } from '@learnlab/core-types';
import {
  addNotification,
  addPermissionRequest,
  clearNotifications,
  createWorkbenchState,
  dismissNotification,
  expireNotification,
  getUnreadNotificationCount,
  resolvePermissionRequest,
  selectActivity,
  toggleNotificationCenter
} from '../apps/desktop/src/renderer/stores/workbenchStore';

const request: PluginPermissionRequest = {
  requestId: 'request-1',
  pluginId: 'org.learnlab.cpp',
  pluginVersion: '1.2.3',
  packageName: 'C++ 入门',
  experimentTitle: '编译第一个程序',
  permissions: { read: ['package.files'], write: ['package.runtime'], execute: ['toolchain'] }
};

describe('desktop workbench state', () => {
  it.each([
    ['expiry', expireNotification],
    ['dismissal', dismissNotification]
  ] as const)(
    'keeps a pending permission request in the center after toast %s',
    (_action, hideToast) => {
      const state = addPermissionRequest(createWorkbenchState(), request);
      expect(state.notifications[0]).toMatchObject({ level: 'info', toastVisible: true });
      expect(getUnreadNotificationCount(state)).toBe(1);

      const hidden = hideToast(state, state.notifications[0].id);
      const center = toggleNotificationCenter(hidden);
      const cleared = clearNotifications(center);

      expect(getUnreadNotificationCount(center)).toBe(0);
      expect(cleared.notifications).toHaveLength(1);
      expect(cleared.notifications[0]).toMatchObject({
        toastVisible: false,
        permission: { request, status: 'pending' }
      });
    }
  );

  it('settles only the matching request and preserves an acknowledged decision across a close event', () => {
    const otherRequest = { ...request, requestId: 'request-2' };
    const pending = addPermissionRequest(addPermissionRequest(createWorkbenchState(), request), otherRequest);
    const closed = resolvePermissionRequest(pending, request.requestId, 'closed');
    expect(closed.notifications[0]).toMatchObject({
      toastVisible: false,
      permission: { status: 'closed' }
    });
    expect(closed.notifications[1]).toBe(pending.notifications[1]);

    const accepted = resolvePermissionRequest(closed, request.requestId, 'always');
    const subsequentClose = resolvePermissionRequest(accepted, request.requestId, 'closed');
    expect(subsequentClose.notifications[0].permission?.status).toBe('always');
    expect(clearNotifications(subsequentClose).notifications).toEqual([pending.notifications[1]]);
  });

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
