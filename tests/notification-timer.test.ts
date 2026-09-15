import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	INFO_NOTIFICATION_DURATION_MS,
	INFO_NOTIFICATION_PROGRESS_MS,
	scheduleNotificationExpiry
} from '../apps/desktop/src/renderer/stores/notificationTimer';

afterEach(() => vi.useRealTimers());

describe('desktop notification timer', () => {
	it('expires each info notification independently', () => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
		const expireFirst = vi.fn();
		const expireSecond = vi.fn();

		scheduleNotificationExpiry({ level: 'info', toastVisible: true, createdAt: Date.now() }, expireFirst);
		vi.advanceTimersByTime(2500);
		scheduleNotificationExpiry({ level: 'info', toastVisible: true, createdAt: Date.now() }, expireSecond);

    vi.advanceTimersByTime(5500);
    expect(expireFirst).toHaveBeenCalledOnce();
    expect(expireSecond).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(expireSecond).toHaveBeenCalledOnce();
  });

	it('does not auto-expire warning or error notifications', () => {
		vi.useFakeTimers();
		const expire = vi.fn();

		scheduleNotificationExpiry({ level: 'warning', toastVisible: true, createdAt: Date.now() }, expire);
		scheduleNotificationExpiry({ level: 'error', toastVisible: true, createdAt: Date.now() }, expire);
		vi.advanceTimersByTime(20000);

		expect(expire).not.toHaveBeenCalled();
	});

	it('preserves the original expiry deadline when the effect restarts', () => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
		const expire = vi.fn();
		const notification = { level: 'info' as const, toastVisible: true, createdAt: Date.now() };

		const cancelFirstTimer = scheduleNotificationExpiry(notification, expire);
		vi.advanceTimersByTime(2500);
		cancelFirstTimer();
		scheduleNotificationExpiry(notification, expire);

		vi.advanceTimersByTime(5499);
		expect(expire).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(expire).toHaveBeenCalledOnce();
	});

	it('finishes the progress strip one second before the info toast expires', () => {
		expect(INFO_NOTIFICATION_DURATION_MS - INFO_NOTIFICATION_PROGRESS_MS).toBe(1000);
	});
});
