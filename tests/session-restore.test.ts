import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceDatabase } from '../packages/core/src';

describe('workspace session settings', () => {
  it('stores and retrieves last_package_id and last_chapter_id', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-session-'));
    try {
      const db = WorkspaceDatabase.open(dir);

      db.setSetting('last_package_id', 'pkg-sql-intro');
      db.setSetting('last_chapter_id', 'chapter-01');

      expect(db.getSetting('last_package_id')).toBe('pkg-sql-intro');
      expect(db.getSetting('last_chapter_id')).toBe('chapter-01');

      db.close();

      // Settings must survive a database close/reopen (portable JSON driver persists to disk).
      const db2 = WorkspaceDatabase.open(dir);
      expect(db2.getSetting('last_package_id')).toBe('pkg-sql-intro');
      expect(db2.getSetting('last_chapter_id')).toBe('chapter-01');
      db2.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for missing settings', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-session-'));
    try {
      const db = WorkspaceDatabase.open(dir);
      expect(db.getSetting('last_package_id')).toBeUndefined();
      db.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overwrites settings on subsequent saves', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-session-'));
    try {
      const db = WorkspaceDatabase.open(dir);

      db.setSetting('last_chapter_id', 'chapter-01');
      db.setSetting('last_chapter_id', 'chapter-03');

      expect(db.getSetting('last_chapter_id')).toBe('chapter-03');
      db.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
