import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calculateContentFingerprint,
  clearExperimentHistory,
  getExperimentAttempts,
  markChapterCompleted,
  markChapterUnread,
  PackageDatabase,
  recordExperimentAttempt,
  syncChapterProgress
} from '../packages/core/src';

describe('reading progress and experiment history separation', () => {
  it('records and recovers reading progress accurately', () => {
    const db = PackageDatabase.open(':memory:');
    try {
      const hash1 = calculateContentFingerprint('# Chapter 1\nContent');

      // 1. Initial progress at 45%
      const p1 = syncChapterProgress(db, 'ch1', hash1, { scrollY: 100, progressPercent: 45 });
      expect(p1.progressPercent).toBe(45);
      expect(p1.completed).toBe(false);

      // 2. Recover from db
      const recovered = db.getReadingProgress('ch1');
      expect(recovered?.scrollY).toBe(100);
      expect(recovered?.progressPercent).toBe(45);
      expect(recovered?.completed).toBe(false);

      // 3. Scroll to bottom (100%): auto completed
      const p2 = syncChapterProgress(db, 'ch1', hash1, { scrollY: 500, progressPercent: 100 });
      expect(p2.completed).toBe(true);
      expect(p2.completedAt).toBeDefined();

      // 4. Mark unread
      const unread = markChapterUnread(db, 'ch1', hash1);
      expect(unread.completed).toBe(false);
      expect(unread.progressPercent).toBe(0);

      // 5. Mark completed
      const completed = markChapterCompleted(db, 'ch1', hash1);
      expect(completed.completed).toBe(true);
      expect(completed.progressPercent).toBe(100);
    } finally {
      db.close();
    }
  });

  it('resets progress when content hash changes and preserves unchanged chapters', () => {
    const db = PackageDatabase.open(':memory:');
    try {
      const originalHashCh1 = calculateContentFingerprint('# Chapter 1: Original text');
      const hashCh2 = calculateContentFingerprint('# Chapter 2: Unchanged text');

      // Both chapters completed
      markChapterCompleted(db, 'ch1', originalHashCh1);
      markChapterCompleted(db, 'ch2', hashCh2);

      expect(db.getReadingProgress('ch1')?.completed).toBe(true);
      expect(db.getReadingProgress('ch2')?.completed).toBe(true);

      // Chapter 1 is edited by author (content hash changes)
      const editedHashCh1 = calculateContentFingerprint('# Chapter 1: Heavily Revised text');

      // Next time user opens ch1, progress is checked against new hash
      const syncedCh1 = syncChapterProgress(db, 'ch1', editedHashCh1);

      // ch1 should be reset to 0% and uncompleted!
      expect(syncedCh1.completed).toBe(false);
      expect(syncedCh1.progressPercent).toBe(0);
      expect(syncedCh1.contentHash).toBe(editedHashCh1);

      // ch2 MUST remain 100% completed!
      const ch2Progress = db.getReadingProgress('ch2');
      expect(ch2Progress?.completed).toBe(true);
      expect(ch2Progress?.progressPercent).toBe(100);
    } finally {
      db.close();
    }
  });

  it('strictly isolates experiment history from reading progress table', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-history-iso-'));
    try {
      const db = PackageDatabase.open(root);

      // Save reading progress
      const hash = calculateContentFingerprint('# Chapter with lab');
      syncChapterProgress(db, 'ch1', hash, { scrollY: 200, progressPercent: 60 });

      // Record 2 experiment attempts
      const attempt1 = {
        attemptId: 'att-001',
        labId: 'lab-sql-select',
        chapterId: 'ch1',
        status: 'failed' as const,
        timestamp: '2026-09-05T01:00:00Z',
        output: 'Syntax error near SELECT * FROMM table',
        error: 'SQL error 1064'
      };
      const attempt2 = {
        attemptId: 'att-002',
        labId: 'lab-sql-select',
        chapterId: 'ch1',
        status: 'passed' as const,
        timestamp: '2026-09-05T01:05:00Z',
        output: 'Query OK, 3 rows returned',
        steps: [{ name: 'Execute query', status: 'passed' as const }]
      };

      const file1 = await recordExperimentAttempt({ packageDir: root, attempt: attempt1, db });
      const file2 = await recordExperimentAttempt({ packageDir: root, attempt: attempt2, db });

      expect(file1).toContain('experiment_history');
      expect(file2).toContain('experiment_history');

      // 1. Verify reading_progress table is NOT polluted by experiment details
      const progress = db.getReadingProgress('ch1');
      expect(progress?.progressPercent).toBe(60);
      expect(progress?.completed).toBe(false);
      // Ensure reading_progress does not have lab fields
      expect((progress as unknown as Record<string, unknown>).output).toBeUndefined();

      // 2. Verify labs table only contains lightweight summary (attempt_count = 2)
      const labSummary = db.getLabSummary('lab-sql-select');
      expect(labSummary?.attemptCount).toBe(2);
      expect(labSummary?.status).toBe('passed');
      expect(labSummary?.lastAttemptAt).toBe('2026-09-05T01:05:00Z');

      // 3. Verify detailed attempts are retrieved from files
      const attempts = await getExperimentAttempts(root, 'lab-sql-select');
      expect(attempts.length).toBe(2);
      expect(attempts[0].attemptId).toBe('att-002'); // Sorted descending
      expect(attempts[0].output).toBe('Query OK, 3 rows returned');

      // 4. Clear history
      await clearExperimentHistory(root, 'lab-sql-select');
      const cleared = await getExperimentAttempts(root, 'lab-sql-select');
      expect(cleared.length).toBe(0);

      // Reading progress is still intact after clearing history!
      expect(db.getReadingProgress('ch1')?.progressPercent).toBe(60);

      db.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

it('resets changed content even when an update payload contains old progress', async () => {
  const { PackageDatabase } = await import('../packages/core/src/database/package-db');
  const { createDatabaseConnection } = await import('../packages/core/src/database/driver');
  const { syncChapterProgress } = await import('../packages/core/src/reading-progress');
  const db = new PackageDatabase(createDatabaseConnection(':memory:'));
  try {
    syncChapterProgress(db, 'chapter', 'hash-a', { scrollY: 900, progressPercent: 100, completed: true });
    const reset = syncChapterProgress(db, 'chapter', 'hash-b', { scrollY: 900, progressPercent: 100, completed: true });
    expect(reset.scrollY).toBe(0);
    expect(reset.progressPercent).toBe(0);
    expect(reset.completed).toBe(false);
  } finally {
    db.close();
  }
});

it('normalizes invalid progress values instead of persisting NaN or infinity', async () => {
  const { PackageDatabase } = await import('../packages/core/src/database/package-db');
  const { createDatabaseConnection } = await import('../packages/core/src/database/driver');
  const { syncChapterProgress } = await import('../packages/core/src/reading-progress');
  const db = new PackageDatabase(createDatabaseConnection(':memory:'));
  try {
    const record = syncChapterProgress(db, 'chapter', 'hash', {
      scrollY: Number.NaN,
      progressPercent: Number.POSITIVE_INFINITY
    });
    expect(record.scrollY).toBe(0);
    expect(record.progressPercent).toBe(0);
  } finally {
    db.close();
  }
});

it('verifies reading progress lifecycle and recovery with fixture of more than 2 chapters', async () => {
  const { PackageDatabase } = await import('../packages/core/src/database/package-db');
  const { createDatabaseConnection } = await import('../packages/core/src/database/driver');
  const { syncChapterProgress, markChapterCompleted } = await import('../packages/core/src/reading-progress');
  const { calculateContentFingerprint } = await import('../packages/core/src/content-fingerprint');
  const { buildChapterNavigationList } = await import('../packages/core/src/chapter-navigation');

  const db = new PackageDatabase(createDatabaseConnection(':memory:'));
  try {
    const chaptersFixture = [
      { id: 'ch1', title: 'Chapter 1: Intro', file: '01.md', experiment_count: 1 },
      { id: 'ch2', title: 'Chapter 2: Querying', file: '02.md', experiment_count: 3 },
      { id: 'ch3', title: 'Chapter 3: Joins', file: '03.md', experiment_count: 2 },
      { id: 'ch4', title: 'Chapter 4: Aggregations', file: '04.md', experiment_count: 0 }
    ];
    const manifest = {
      id: 'multi.ch.pkg',
      version: '1.0.0',
      name: 'Multi Chapter Course',
      author: 'Author',
      chapters: chaptersFixture
    };

    const hash1 = calculateContentFingerprint('# Ch 1 content');
    const hash2 = calculateContentFingerprint('# Ch 2 content');
    const hash3 = calculateContentFingerprint('# Ch 3 content');

    // 1. Read Ch1 to 50%
    syncChapterProgress(db, 'ch1', hash1, { scrollY: 150, progressPercent: 50 });
    // 2. Read Ch2 to bottom -> 100% completed
    syncChapterProgress(db, 'ch2', hash2, { scrollY: 600, progressPercent: 100 });
    // 3. Mark Ch3 completed explicitly
    markChapterCompleted(db, 'ch3', hash3);
    // Ch4 remains untouched

    // Build navigation list
    const allProgress = db.getAllReadingProgress();
    const navList = buildChapterNavigationList(manifest, allProgress);

    expect(navList.length).toBe(4);
    expect(navList[0]).toMatchObject({ id: 'ch1', orderIndex: 1, experimentCount: 1, completed: false, progressPercent: 50 });
    expect(navList[1]).toMatchObject({ id: 'ch2', orderIndex: 2, experimentCount: 3, completed: true, progressPercent: 100 });
    expect(navList[2]).toMatchObject({ id: 'ch3', orderIndex: 3, experimentCount: 2, completed: true, progressPercent: 100 });
    expect(navList[3]).toMatchObject({ id: 'ch4', orderIndex: 4, experimentCount: 0, completed: false, progressPercent: 0 });

    // 4. Content of Ch2 is modified: hash changes
    const hash2Modified = calculateContentFingerprint('# Ch 2 content (revised)');
    const reopenedCh2 = syncChapterProgress(db, 'ch2', hash2Modified);
    expect(reopenedCh2.completed).toBe(false);
    expect(reopenedCh2.progressPercent).toBe(0);

    // Ch1 and Ch3 remain intact
    expect(db.getReadingProgress('ch1')?.progressPercent).toBe(50);
    expect(db.getReadingProgress('ch3')?.completed).toBe(true);
  } finally {
    db.close();
  }
});
