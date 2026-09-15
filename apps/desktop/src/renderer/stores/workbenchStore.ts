import type { WorkbenchActivityId } from '../utils/workbench';

export type WorkbenchTheme = 'dark' | 'light';
export type BottomPanelId = 'output' | 'history' | 'problems';
export type NotificationLevel = 'info' | 'warning' | 'error';

export interface NotificationInput {
  level: NotificationLevel;
  title: string;
  message: string;
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
    notifications: state.notifications.filter((item) => item.id !== notificationId)
  };
}

export function clearNotifications(state: WorkbenchState): WorkbenchState {
  return { ...state, notifications: [] };
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
