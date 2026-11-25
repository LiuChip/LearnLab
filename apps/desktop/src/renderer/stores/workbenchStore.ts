import type { PluginPermissionDecision, PluginPermissionRequest } from '@learnlab/core-types';
import type { WorkbenchActivityId } from '../utils/workbench';

export type WorkbenchTheme = 'dark' | 'light';
export type BottomPanelId = 'output' | 'history' | 'problems';
export type NotificationLevel = 'info' | 'warning' | 'error';
type PermissionRequestStatus = 'pending' | 'closed' | PluginPermissionDecision;

export interface NotificationInput {
  level: NotificationLevel;
  title: string;
  message: string;
  permission?: {
    request: PluginPermissionRequest;
    status: PermissionRequestStatus;
  };
}

export interface NotificationEntry extends NotificationInput {
  id: string;
  createdAt: number;
  read: boolean;
  toastVisible: boolean;
}

export interface WorkbenchState {
  activeActivity: WorkbenchActivityId;
  primaryVisible: boolean;
  auxiliaryVisible: boolean;
  bottomPanelVisible: boolean;
  bottomPanel: BottomPanelId;
  notificationCenterVisible: boolean;
  notifications: NotificationEntry[];
  notificationSequence: number;
  theme: WorkbenchTheme;
}

export function createWorkbenchState(): WorkbenchState {
  return {
    activeActivity: 'chapters',
    primaryVisible: true,
    auxiliaryVisible: true,
    bottomPanelVisible: false,
    bottomPanel: 'output',
    notificationCenterVisible: false,
    notifications: [],
    notificationSequence: 0,
    theme: 'dark'
  };
}

export function selectActivity(
  state: WorkbenchState,
  activity: WorkbenchActivityId
): WorkbenchState {
  if (state.activeActivity === activity) {
    return { ...state, primaryVisible: !state.primaryVisible };
  }
  return { ...state, activeActivity: activity, primaryVisible: true };
}

export function setBottomPanel(state: WorkbenchState, panel: BottomPanelId): WorkbenchState {
  return { ...state, bottomPanel: panel, bottomPanelVisible: true };
}

export function addNotification(
  state: WorkbenchState,
  input: NotificationInput
): WorkbenchState {
  const notificationSequence = state.notificationSequence + 1;
  const notification: NotificationEntry = {
    ...input,
    id: `notification:${notificationSequence}`,
    createdAt: Date.now(),
    read: state.notificationCenterVisible,
    toastVisible: !state.notificationCenterVisible
  };
  return {
    ...state,
    notificationSequence,
    notifications: [...state.notifications, notification]
  };
}

export function addPermissionRequest(
  state: WorkbenchState,
  request: PluginPermissionRequest
): WorkbenchState {
  if (state.notifications.some((item) => item.permission?.request.requestId === request.requestId)) return state;
  return addNotification(state, {
    level: 'info',
    title: '插件请求权限',
    message: `${request.pluginId} · v${request.pluginVersion}`,
    permission: { request, status: 'pending' }
  });
}

export function resolvePermissionRequest(
  state: WorkbenchState,
  requestId: string,
  status: Exclude<PermissionRequestStatus, 'pending'>
): WorkbenchState {
  return {
    ...state,
    notifications: state.notifications.map((item) => {
      const permission = item.permission;
      if (permission?.request.requestId !== requestId) return item;
      // A close event can reach the renderer before the reply to a submitted decision.
      if (permission.status !== 'pending' && permission.status !== 'closed') return item;
      return { ...item, toastVisible: false, permission: { ...permission, status } };
    })
  };
}

export function expireNotification(
  state: WorkbenchState,
  notificationId: string
): WorkbenchState {
  return {
    ...state,
    notifications: state.notifications.map((item) =>
      item.id === notificationId ? { ...item, toastVisible: false } : item
    )
  };
}

export function dismissNotification(
  state: WorkbenchState,
  notificationId: string
): WorkbenchState {
  return {
    ...state,
    notifications: state.notifications.flatMap((item) => {
      if (item.id !== notificationId) return [item];
      return item.permission?.status === 'pending' ? [{ ...item, toastVisible: false }] : [];
    })
  };
}

export function clearNotifications(state: WorkbenchState): WorkbenchState {
  return { ...state, notifications: state.notifications.filter((item) => item.permission?.status === 'pending') };
}

export function toggleNotificationCenter(state: WorkbenchState): WorkbenchState {
  const notificationCenterVisible = !state.notificationCenterVisible;
  return {
    ...state,
    notificationCenterVisible,
    notifications: notificationCenterVisible
      ? state.notifications.map((item) => ({ ...item, read: true, toastVisible: false }))
      : state.notifications
  };
}

export function getUnreadNotificationCount(state: WorkbenchState): number {
  return state.notifications.filter((item) => !item.read).length;
}
