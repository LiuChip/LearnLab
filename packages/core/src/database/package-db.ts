import * as path from 'node:path';
import { createDatabaseConnection, type DatabaseConnection } from './driver';
import { runMigrations, type Migration } from './migrations';

export interface ChapterIndexRecord {
  chapterId: string;
  relativePath: string;
  contentHash: string;
  orderIndex: number;
}

export interface ReadingProgressRecord {
  chapterId: string;
  scrollY: number;
  progressPercent: number;
  completed: boolean;
  completedAt?: string;
  contentHash: string;
  updatedAt: string;
}

export interface LabSummaryRecord {
  labId: string;
  chapterId: string;
  status: 'passed' | 'failed' | 'not_started' | 'running';
  attemptCount: number;
  lastAttemptAt?: string;
}

export const PACKAGE_DB_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial package schema with chapters, reading_progress, labs, metadata, sessions',
    up: (db: DatabaseConnection) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chapters (
          chapter_id TEXT PRIMARY KEY,
          relative_path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          order_index INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reading_progress (
          chapter_id TEXT PRIMARY KEY,
          scroll_y REAL NOT NULL DEFAULT 0,
          progress_percent REAL NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          content_hash TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS labs (
          lab_id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TEXT
        );

        CREATE TABLE IF NOT EXISTS package_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
  }
];

export class PackageDatabase {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
    runMigrations(this.db, PACKAGE_DB_MIGRATIONS);
  }

  static open(packageDir: string, options?: { forcePortable?: boolean }): PackageDatabase {
    let dbPath = ':memory:';
    if (packageDir !== ':memory:') {
      dbPath = path.join(path.resolve(packageDir), 'package.db');
    }
    const conn = createDatabaseConnection(dbPath, options);
    return new PackageDatabase(conn);
  }

  getConnection(): DatabaseConnection {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // --- Chapters Index ---
  saveChapters(chapters: ChapterIndexRecord[]): void {
    this.db.transaction(() => {
      const keepIds = new Set(chapters.map((chapter) => chapter.chapterId));
      const existing = this.getChapters();
      const deleteStmt = this.db.prepare('DELETE FROM chapters WHERE chapter_id = ?');
      for (const chapter of existing) {
        if (!keepIds.has(chapter.chapterId)) deleteStmt.run(chapter.chapterId);
      }
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO chapters (chapter_id, relative_path, content_hash, order_index)
        VALUES (?, ?, ?, ?)
      `);
      for (const ch of chapters) {
        if (!ch.chapterId || !ch.relativePath || !Number.isInteger(ch.orderIndex) || ch.orderIndex < 0) {
          throw new TypeError('Invalid chapter index record');
        }
        stmt.run(ch.chapterId, ch.relativePath, ch.contentHash.toLowerCase(), ch.orderIndex);
      }
    });
  }

  getChapters(): ChapterIndexRecord[] {
    const stmt = this.db.prepare(`
      SELECT chapter_id, relative_path, content_hash, order_index
      FROM chapters ORDER BY order_index ASC
    `);
    const rows = stmt.all();
    return rows.map((r) => ({
      chapterId: String(r.chapter_id),
      relativePath: String(r.relative_path),
      contentHash: String(r.content_hash),
      orderIndex: Number(r.order_index)
    }));
  }

  // --- Reading Progress ---
  saveReadingProgress(record: ReadingProgressRecord): void {
    if (!record.chapterId || !record.contentHash || !record.updatedAt ||
        !Number.isFinite(record.scrollY) || record.scrollY < 0 ||
        !Number.isFinite(record.progressPercent) || record.progressPercent < 0 || record.progressPercent > 100) {
      throw new TypeError('Invalid reading progress record');
    }
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reading_progress (
        chapter_id, scroll_y, progress_percent, completed, completed_at, content_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.chapterId,
      record.scrollY,
      record.progressPercent,
      record.completed ? 1 : 0,
      record.completedAt ?? null,
      record.contentHash.toLowerCase(),
      record.updatedAt
    );
  }

  getReadingProgress(chapterId: string): ReadingProgressRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT chapter_id, scroll_y, progress_percent, completed, completed_at, content_hash, updated_at
      FROM reading_progress WHERE chapter_id = ?
    `);
    const row = stmt.get(chapterId);
    if (!row) return undefined;

    return {
      chapterId: String(row.chapter_id),
      scrollY: Number(row.scroll_y),
      progressPercent: Number(row.progress_percent),
      completed: Number(row.completed) === 1,
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      contentHash: String(row.content_hash),
      updatedAt: String(row.updated_at)
    };
  }

  getAllReadingProgress(): ReadingProgressRecord[] {
    const stmt = this.db.prepare(`
      SELECT chapter_id, scroll_y, progress_percent, completed, completed_at, content_hash, updated_at
      FROM reading_progress ORDER BY chapter_id ASC
    `);
    const rows = stmt.all();
    return rows.map((row) => ({
      chapterId: String(row.chapter_id),
      scrollY: Number(row.scroll_y),
      progressPercent: Number(row.progress_percent),
      completed: Number(row.completed) === 1,
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      contentHash: String(row.content_hash),
      updatedAt: String(row.updated_at)
    }));
  }

  // --- Labs Summary ---
  saveLabSummary(lab: LabSummaryRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO labs (lab_id, chapter_id, status, attempt_count, last_attempt_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(lab.labId, lab.chapterId, lab.status, lab.attemptCount, lab.lastAttemptAt ?? null);
  }

  getLabSummary(labId: string): LabSummaryRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT lab_id, chapter_id, status, attempt_count, last_attempt_at
      FROM labs WHERE lab_id = ?
    `);
    const row = stmt.get(labId);
    if (!row) return undefined;

    return {
      labId: String(row.lab_id),
      chapterId: String(row.chapter_id),
      status: row.status as LabSummaryRecord['status'],
      attemptCount: Number(row.attempt_count),
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : undefined
    };
  }

  getAllLabSummaries(): LabSummaryRecord[] {
    const stmt = this.db.prepare(`
      SELECT lab_id, chapter_id, status, attempt_count, last_attempt_at
      FROM labs ORDER BY lab_id ASC
    `);
    const rows = stmt.all();
    return rows.map((row) => ({
      labId: String(row.lab_id),
      chapterId: String(row.chapter_id),
      status: row.status as LabSummaryRecord['status'],
      attemptCount: Number(row.attempt_count),
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : undefined
    }));
  }

  // --- Metadata & Sessions ---
  setMetadata(key: string, value: string): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO package_metadata (key, value) VALUES (?, ?)'
    );
    stmt.run(key, value);
  }

  getMetadata(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM package_metadata WHERE key = ?');
    const row = stmt.get(key);
    return row ? String(row.value) : undefined;
  }

  setSession(key: string, value: string): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO sessions (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  getSession(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM sessions WHERE key = ?');
    const row = stmt.get(key);
    return row ? String(row.value) : undefined;
  }
}
