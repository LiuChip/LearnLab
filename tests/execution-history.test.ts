import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  recordExperimentAttempt,
  getExperimentAttempts
} from '../packages/core/src/experiment-history';
import type { ExperimentAttemptDetail } from '../packages/core/src/experiment-history';

describe('execution history auto-record', () => {
  it('records a passed attempt and retrieves it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-exec-history-'));
    try {
      const attempt: ExperimentAttemptDetail = {
        attemptId: 'exec-001',
        labId: 'select-all-users',
        chapterId: 'chapter-01',
        status: 'passed',
        timestamp: new Date().toISOString(),
        durationMs: 1234,
        steps: [
          { name: '结果行数匹配', status: 'passed' },
          { name: '列名正确', status: 'passed' }
        ]
      };

      await recordExperimentAttempt({ packageDir: dir, attempt });

      const attempts = await getExperimentAttempts(dir, 'select-all-users');
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe('passed');
      expect(attempts[0].durationMs).toBe(1234);
      expect(attempts[0].steps).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records a failed attempt with error message', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-exec-history-'));
    try {
      const attempt: ExperimentAttemptDetail = {
        attemptId: 'exec-002',
        labId: 'select-all-users',
        chapterId: 'chapter-01',
        status: 'failed',
        timestamp: new Date().toISOString(),
        durationMs: 500,
        error: '结果行数不匹配：期望 3 行，实际 1 行',
        steps: [
          { name: '结果行数匹配', status: 'failed', message: '期望 3 行，实际 1 行' }
        ]
      };

      await recordExperimentAttempt({ packageDir: dir, attempt });

      const attempts = await getExperimentAttempts(dir, 'select-all-users');
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe('failed');
      expect(attempts[0].error).toContain('行数不匹配');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accumulates multiple attempts newest first', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-exec-history-'));
    try {
      const base = {
        labId: 'select-all-users',
        chapterId: 'chapter-01',
        status: 'failed' as const
      };

      await recordExperimentAttempt({
        packageDir: dir,
        attempt: { ...base, attemptId: 'exec-001', timestamp: '2026-11-24T10:00:00.000Z' }
      });
      await recordExperimentAttempt({
        packageDir: dir,
        attempt: { ...base, attemptId: 'exec-002', timestamp: '2026-11-24T10:01:00.000Z', status: 'passed' }
      });

      const attempts = await getExperimentAttempts(dir, 'select-all-users');
      expect(attempts).toHaveLength(2);
      // sorted newest first
      expect(attempts[0].attemptId).toBe('exec-002');
      expect(attempts[1].attemptId).toBe('exec-001');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a cancelled execution is recorded as failed', async () => {
    // The ipc handler maps cancelled/timeout → 'failed' in the attempt status
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-exec-history-'));
    try {
      await recordExperimentAttempt({
        packageDir: dir,
        attempt: {
          attemptId: 'exec-003',
          labId: 'select-all-users',
          chapterId: 'chapter-01',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: '已取消'
        }
      });
      const attempts = await getExperimentAttempts(dir, 'select-all-users');
      expect(attempts[0].status).toBe('failed');
      expect(attempts[0].error).toBe('已取消');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
