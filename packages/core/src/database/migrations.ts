import type { DatabaseConnection } from './driver';

export interface Migration {
  version: number;
  description: string;
  up: (db: DatabaseConnection) => void;
}

export interface AppliedMigration {
  version: number;
  appliedAt: string;
}

export function initMigrationTable(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

export function getAppliedMigrations(db: DatabaseConnection): AppliedMigration[] {
  initMigrationTable(db);
  return db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC').all().map((r) => ({
    version: Number(r.version), appliedAt: String(r.applied_at)
  }));
}

export function getCurrentSchemaVersion(db: DatabaseConnection): number {
  initMigrationTable(db);
  const row = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
  return row ? Number(row.version) : 0;
}

function validateMigrations(migrations: Migration[]): void {
  const versions = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Migration version must be a positive integer: ${migration.version}`);
    }
    if (versions.has(migration.version)) throw new Error(`Duplicate migration version: ${migration.version}`);
    if (!migration.description.trim()) throw new Error(`Migration ${migration.version} has no description`);
    versions.add(migration.version);
  }
}

export function runMigrations(db: DatabaseConnection, migrations: Migration[]): number[] {
  validateMigrations(migrations);
  initMigrationTable(db);
  const supportedVersion = migrations.reduce(
    (highest, migration) => Math.max(highest, migration.version),
    0
  );
  const currentVersion = getCurrentSchemaVersion(db);
  if (currentVersion > supportedVersion) {
    throw new Error(
      `Database uses newer schema version ${currentVersion}; supported version is ${supportedVersion}`
    );
  }
  const appliedSet = new Set(getAppliedMigrations(db).map((m) => m.version));
  const newlyApplied: number[] = [];

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (appliedSet.has(migration.version)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version, new Date().toISOString()
      );
    });
    appliedSet.add(migration.version);
    newlyApplied.push(migration.version);
  }
  return newlyApplied;
}
