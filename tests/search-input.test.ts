import { describe, expect, it, vi } from 'vitest';
import {
  getSearchInputEffect,
  scheduleLiveSearch
} from '../apps/desktop/src/renderer/stores/searchInput';

describe('desktop search input behavior', () => {
  it('starts a search for a non-empty query', () => {
    expect(getSearchInputEffect('markdown')).toEqual({ type: 'search' });
  });

  it('clears results when the query becomes empty or whitespace', () => {
    expect(getSearchInputEffect('')).toEqual({ type: 'clear' });
    expect(getSearchInputEffect('   ')).toEqual({ type: 'clear' });
  });

  it('runs only the latest query after a short pause in typing', () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn();
      const cancelFirst = scheduleLiveSearch('a', search);
      vi.advanceTimersByTime(100);
      cancelFirst();
      const cancelSecond = scheduleLiveSearch('ab', search);
      vi.advanceTimersByTime(249);
      expect(search).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith('ab');
      cancelSecond();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not schedule a search for empty input', () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn();
      scheduleLiveSearch('   ', search);
      vi.runAllTimers();
      expect(search).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
