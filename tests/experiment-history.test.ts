import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearExperimentHistory, getExperimentAttempts, getExperimentHistoryDir, recordExperimentAttempt } from '../packages/core/src/experiment-history';

describe('experiment history path safety', () => {
  it('rejects traversal in lab and attempt identifiers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-history-'));
    try {
      expect(() => getExperimentHistoryDir(root, '../outside')).toThrow();
      await expect(recordExperimentAttempt({
        packageDir: root,
        attempt: {
          attemptId: '../outside', labId: 'lab', chapterId: 'chapter', status: 'failed',
          timestamp: new Date().toISOString()
        }
      })).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes attempts atomically and only clears a validated lab directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-history-'));
    try {
      const file = await recordExperimentAttempt({
        packageDir: root,
        attempt: {
          attemptId: 'attempt-1', labId: 'lab', chapterId: 'chapter', status: 'passed',
          timestamp: new Date().toISOString()
        }
      });
      expect(file).toContain(path.join('experiment_history', 'lab'));
      expect(await getExperimentAttempts(root, 'lab')).toHaveLength(1);
      await clearExperimentHistory(root, 'lab');
      expect(await getExperimentAttempts(root, 'lab')).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
