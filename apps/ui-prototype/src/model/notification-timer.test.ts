import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleNotificationExpiry } from './notification-timer';
import type { NotificationEntry } from './workbench';

const info = (id: string): NotificationEntry => ({
  id,
  level: 'info',
  title: id,
  message: id,
  createdAt: Date.now(),
  read: false,
  toastVisible: true
});
afterEach(() => {
  vi.useRealTimers();
});

describe('notification expiry', () => {
  it('expires every info independently even if later notifications arrive or the effect restarts', () => {
    vi.useFakeTimers();
    const first = info('run');
    const expireFirst = vi.fn();
    const cancel = scheduleNotificationExpiry(first, expireFirst);
    vi.advanceTimersByTime(4000);
    const second = info('refresh');
    const expireSecond = vi.fn();
    scheduleNotificationExpiry(second, expireSecond);
    cancel();
    scheduleNotificationExpiry(first, expireFirst);
    vi.advanceTimersByTime(3999);
    expect(expireFirst).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expireFirst).toHaveBeenCalledOnce();
    expect(expireSecond).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(expireSecond).toHaveBeenCalledOnce();
  });

  it('keeps warnings/errors and cancels timers for closed toasts', () => {
    vi.useFakeTimers();
    const expire = vi.fn();
    scheduleNotificationExpiry({ ...info('warn'), level: 'warning' }, expire);
    scheduleNotificationExpiry({ ...info('error'), level: 'error' }, expire);
    scheduleNotificationExpiry({ ...info('history'), toastVisible: false }, expire);
    const cancel = scheduleNotificationExpiry(info('closed'), expire);
    cancel();
    vi.advanceTimersByTime(10000);
    expect(expire).not.toHaveBeenCalled();
  });
});
