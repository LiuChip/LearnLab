import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDatabaseConnection,
  getCurrentSchemaVersion,
  getAppliedMigrations,
  PackageDatabase,
  runMigrations,
  WorkspaceDatabase,
  type Migration
} from '../packages/core/src';

describe('database migrations and database abstractions', () => {
  it('runs ordered migrations idempotently', () => {
    const db = createDatabaseConnection(':memory:');
    try {
      const step1Applied: string[] = [];
      const step2Applied: string[] = [];

      const migrations: Migration[] = [
        {
          version: 2,
          description: 'Add table b',
          up: (conn) => {
            conn.exec('CREATE TABLE table_b (id INTEGER PRIMARY KEY);');
            step2Applied.push('v2');
          }
        },
        {
          version: 1,
          description: 'Add table a',
          up: (conn) => {
            conn.exec('CREATE TABLE table_a (id INTEGER PRIMARY KEY);');
            step1Applied.push('v1');
          }
        }
      ];
      // Run migrations (passed out of order to verify ascending sort)
      const applied = runMigrations(db, migrations);
      expect(applied).toEqual([1, 2]);
      expect(step1Applied).toEqual(['v1']);
      expect(step2Applied).toEqual(['v2']);
      expect(getCurrentSchemaVersion(db)).toBe(2);

      const records = getAppliedMigrations(db);
      expect(records.length).toBe(2);
      expect(records[0].version).toBe(1);
      expect(records[1].version).toBe(2);

      // Idempotency: re-running should apply nothing
      const reRunApplied = runMigrations(db, migrations);
      expect(reRunApplied).toEqual([]);
      expect(step1Applied.length).toBe(1);
      expect(step2Applied.length).toBe(1);
    } finally {
      db.close();
    }
  });

  it('preserves SQL INSERT uniqueness semantics in portable mode', () => {
    const db = createDatabaseConnection(':memory:', { forcePortable: true });
    try {
      db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, value TEXT NOT NULL);');
      db.prepare('INSERT INTO records (id, value) VALUES (?, ?)').run('one', 'first');
      expect(() => db.prepare('INSERT INTO records (id, value) VALUES (?, ?)').run('one', 'second')).toThrow('duplicate primary key');
      db.prepare('INSERT OR REPLACE INTO records (id, value) VALUES (?, ?)').run('one', 'second');
      expect(db.prepare('SELECT value FROM records WHERE id = ?').get('one')?.value).toBe('second');
    } finally {
      db.close();
    }
  });

  it('manages workspace.db operations and persists across reopen', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-ws-db-'));
    try {
      const db1 = WorkspaceDatabase.open(root);
      db1.registerPackage({
        id: 'pkg.sql',
        name: 'SQL Basics',
        version: '1.0.0',
        path: '/packages/sql',
        isSymlink: false,
        registeredAt: new Date().toISOString()
      });
      db1.recordLink('/packages/link-sql', '/packages/sql');
      db1.recordDependency({
        dependencyId: 'org.sqlite',
        version: '3.45.0',
        platform: 'darwin',
        arch: 'arm64',
        sha256: 'a'.repeat(64),
        path: '/deps/sqlite',
        sourceType: 'bundled',
        status: 'installed',
        installedAt: new Date().toISOString()
      });
      db1.linkPackageDependency({
        packageId: 'pkg.sql',
        dependencyId: 'org.sqlite',
        requiredVersion: '^3.0.0',
        resolvedVersion: '3.45.0',
        resolvedSha256: 'a'.repeat(64),
        sourceType: 'bundled',
        status: 'ready'
      });
      db1.setSetting('theme', 'dark');
      db1.close();
      expect((await stat(path.join(root, 'workspace.db'))).isFile()).toBe(true);

      // Re-open and verify persistence
      const db2 = WorkspaceDatabase.open(root);
      const pkg = db2.getPackage('pkg.sql');
      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe('SQL Basics');
      expect(pkg?.version).toBe('1.0.0');

      const packages = db2.listPackages();
      expect(packages.length).toBe(1);

      expect(db2.getLink('/packages/link-sql')).toBe('/packages/sql');

      const deps = db2.getDependencies();
      expect(deps.length).toBe(1);
      expect(deps[0].dependencyId).toBe('org.sqlite');
      expect(deps[0].sha256).toBe('a'.repeat(64));

      const links = db2.getPackageDependencies('pkg.sql');
      expect(links.length).toBe(1);
      expect(links[0].status).toBe('ready');

      expect(db2.getSetting('theme')).toBe('dark');

      // Unregister package
      const removed = db2.unregisterPackage('pkg.sql');
      expect(removed).toBe(true);
      expect(db2.getPackage('pkg.sql')).toBeUndefined();
      expect(db2.getPackageDependencies('pkg.sql').length).toBe(0);

      db2.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('manages package.db operations and persists across reopen', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-pkg-db-'));
    try {
      const db1 = PackageDatabase.open(root);
      db1.saveChapters([
        { chapterId: 'ch1', relativePath: 'ch1.md', contentHash: 'hash1', orderIndex: 0 },
        { chapterId: 'ch2', relativePath: 'ch2.md', contentHash: 'hash2', orderIndex: 1 }
      ]);
      db1.saveReadingProgress({
        chapterId: 'ch1',
        scrollY: 150,
        progressPercent: 50,
        completed: false,
        contentHash: 'hash1',
        updatedAt: new Date().toISOString()
      });
      db1.saveLabSummary({
        labId: 'lab-create-table',
        chapterId: 'ch1',
        status: 'passed',
        attemptCount: 3,
        lastAttemptAt: new Date().toISOString()
      });
      db1.setMetadata('declared_experiment_count', '5');
      db1.setSession('active_tab', 'ch1');
      db1.close();

      // Re-open and verify persistence
      const db2 = PackageDatabase.open(root);
      const chapters = db2.getChapters();
      expect(chapters.length).toBe(2);
      expect(chapters[0].chapterId).toBe('ch1');
      expect(chapters[1].chapterId).toBe('ch2');

      const progress = db2.getReadingProgress('ch1');
      expect(progress).toBeDefined();
      expect(progress?.progressPercent).toBe(50);
      expect(progress?.completed).toBe(false);

      const lab = db2.getLabSummary('lab-create-table');
      expect(lab).toBeDefined();
      expect(lab?.status).toBe('passed');
      expect(lab?.attemptCount).toBe(3);

      expect(db2.getMetadata('declared_experiment_count')).toBe('5');
      expect(db2.getSession('active_tab')).toBe('ch1');

      db2.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

it('rejects databases created by a newer schema version', () => {
  const db = createDatabaseConnection(':memory:');
  try {
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (99, 'future');
    `);

    expect(() => runMigrations(db, [{
      version: 1,
      description: 'Current schema',
      up: () => undefined
    }])).toThrow(/newer schema version/i);
  } finally {
    db.close();
  }
});

it('preserves composite primary keys in the portable database', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'learnlab-portable-db-'));
  try {
    const db = WorkspaceDatabase.open(root, { forcePortable: true });
    db.recordDependency({
      dependencyId: 'dep.one', version: '1.0.0', platform: 'darwin', arch: 'arm64',
      sha256: 'b'.repeat(64), path: '/deps/one', sourceType: 'bundled', status: 'installed'
    });
    expect(db.getDependencies()).toHaveLength(1);
    db.close();
    const reopened = WorkspaceDatabase.open(root, { forcePortable: true });
    expect(reopened.getDependencies()).toHaveLength(1);
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('removes stale chapters when refreshing a package chapter index', () => {
  const db = PackageDatabase.open(':memory:');
  try {
    db.saveChapters([
      { chapterId: 'one', relativePath: 'one.md', contentHash: 'a', orderIndex: 0 },
      { chapterId: 'two', relativePath: 'two.md', contentHash: 'b', orderIndex: 1 }
    ]);
    db.saveChapters([{ chapterId: 'one', relativePath: 'one.md', contentHash: 'a2', orderIndex: 0 }]);
    expect(db.getChapters().map((chapter) => chapter.chapterId)).toEqual(['one']);
  } finally {
    db.close();
  }
});

it('rolls back a failed migration', () => {
  const db = createDatabaseConnection(':memory:');
  try {
    expect(() => runMigrations(db, [{ version: 1, description: 'fails', up: (conn) => {
      conn.exec('CREATE TABLE should_rollback (id TEXT PRIMARY KEY)');
      throw new Error('boom');
    }}])).toThrow('boom');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'should_rollback'").get()).toBeUndefined();
  } finally {
    db.close();
  }
});
