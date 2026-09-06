import * as path from 'node:path';
import type {
  PackageDependencyLink,
  RegisteredPackage,
  WorkspaceDependencyRecord,
  WorkspacePrerequisiteRecord
} from '@learnlab/core-types';
import { createDatabaseConnection, type DatabaseConnection } from './driver';
import { runMigrations, type Migration } from './migrations';

export const WORKSPACE_DB_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial workspace schema with packages, links, settings, and dependencies',
    up: (db: DatabaseConnection) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS packages (
          package_id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          version TEXT NOT NULL,
          display_name TEXT NOT NULL,
          is_symlink INTEGER NOT NULL DEFAULT 0,
          target_path TEXT,
          registered_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS links (
          link_path TEXT PRIMARY KEY,
          target_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dependency_records (
          dependency_id TEXT NOT NULL,
          version TEXT NOT NULL,
          platform TEXT NOT NULL,
          arch TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          path TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_package_id TEXT,
          status TEXT NOT NULL,
          installed_at TEXT NOT NULL,
          PRIMARY KEY (dependency_id, version, platform, arch, sha256)
        );

        CREATE TABLE IF NOT EXISTS prerequisites (
          package_id TEXT NOT NULL,
          prerequisite_id TEXT NOT NULL,
          version TEXT NOT NULL,
          required INTEGER NOT NULL,
          reason TEXT,
          detect TEXT,
          PRIMARY KEY (package_id, prerequisite_id)
        );

        CREATE TABLE IF NOT EXISTS package_dependencies (
          package_id TEXT NOT NULL,
          dependency_id TEXT NOT NULL,
          required_version TEXT NOT NULL,
          resolved_version TEXT,
          resolved_sha256 TEXT,
          source_type TEXT NOT NULL,
          status TEXT NOT NULL,
          PRIMARY KEY (package_id, dependency_id)
        );
      `);
    }
  },
  {
    version: 2,
    description: 'Add external prerequisite records for existing workspaces',
    up: (db: DatabaseConnection) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS prerequisites (
          package_id TEXT NOT NULL,
          prerequisite_id TEXT NOT NULL,
          version TEXT NOT NULL,
          required INTEGER NOT NULL,
          reason TEXT,
          detect TEXT,
          PRIMARY KEY (package_id, prerequisite_id)
        )
      `);
    }
  }
];

export class WorkspaceDatabase {
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
    runMigrations(this.db, WORKSPACE_DB_MIGRATIONS);
  }

  static open(workspaceDir: string, options?: { forcePortable?: boolean }): WorkspaceDatabase {
    let dbPath = ':memory:';
    if (workspaceDir !== ':memory:') {
      dbPath = path.join(path.resolve(workspaceDir), 'workspace.db');
    }
    const conn = createDatabaseConnection(dbPath, options);
    return new WorkspaceDatabase(conn);
  }

  getConnection(): DatabaseConnection {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // --- Package Management ---
  registerPackage(pkg: RegisteredPackage): void {
    const stmt = this.db.prepare(`
      INSERT INTO packages (
        package_id, path, version, display_name, is_symlink, target_path, registered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      pkg.id,
      pkg.path,
      pkg.version,
      pkg.name,
      pkg.isSymlink ? 1 : 0,
      pkg.targetPath ?? null,
      pkg.registeredAt
    );
  }

  unregisterPackage(packageId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM packages WHERE package_id = ?');
    const res = stmt.run(packageId);

    this.db.prepare('DELETE FROM package_dependencies WHERE package_id = ?').run(packageId);
    this.db.prepare('DELETE FROM prerequisites WHERE package_id = ?').run(packageId);

    return res.changes > 0;
  }

  getPackage(packageId: string): RegisteredPackage | undefined {
    const stmt = this.db.prepare(`
      SELECT package_id, path, version, display_name, is_symlink, target_path, registered_at
      FROM packages WHERE package_id = ?
    `);
    const row = stmt.get(packageId);
    if (!row) return undefined;

    return {
      id: String(row.package_id),
      name: String(row.display_name),
      version: String(row.version),
      path: String(row.path),
      isSymlink: Number(row.is_symlink) === 1,
      targetPath: row.target_path ? String(row.target_path) : undefined,
      registeredAt: String(row.registered_at)
    };
  }

  listPackages(): RegisteredPackage[] {
    const stmt = this.db.prepare(`
      SELECT package_id, path, version, display_name, is_symlink, target_path, registered_at
      FROM packages ORDER BY registered_at ASC
    `);
    const rows = stmt.all();
    return rows.map((row) => ({
      id: String(row.package_id),
      name: String(row.display_name),
      version: String(row.version),
      path: String(row.path),
      isSymlink: Number(row.is_symlink) === 1,
      targetPath: row.target_path ? String(row.target_path) : undefined,
      registeredAt: String(row.registered_at)
    }));
  }

  // --- Links Management ---
  recordLink(linkPath: string, targetPath: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO links (link_path, target_path, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(linkPath, targetPath, new Date().toISOString());
  }

  removeLink(linkPath: string): boolean {
    return this.db.prepare('DELETE FROM links WHERE link_path = ?').run(linkPath).changes > 0;
  }

  getLink(linkPath: string): string | undefined {
    const stmt = this.db.prepare('SELECT target_path FROM links WHERE link_path = ?');
    const row = stmt.get(linkPath);
    return row ? String(row.target_path) : undefined;
  }

  // --- Dependency Records ---
  recordDependency(record: WorkspaceDependencyRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO dependency_records (
        dependency_id, version, platform, arch, sha256, path, source_type, source_package_id, status, installed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.dependencyId,
      record.version,
      record.platform,
      record.arch,
      record.sha256.toLowerCase(),
      record.path,
      record.sourceType,
      record.sourcePackageId ?? null,
      record.status,
      record.installedAt ?? new Date().toISOString()
    );
  }

  getDependencies(): WorkspaceDependencyRecord[] {
    const stmt = this.db.prepare(`
      SELECT dependency_id, version, platform, arch, sha256, path, source_type, source_package_id, status, installed_at
      FROM dependency_records ORDER BY installed_at ASC
    `);
    const rows = stmt.all();
    return rows.map((row) => ({
      dependencyId: String(row.dependency_id),
      version: String(row.version),
      platform: String(row.platform),
      arch: String(row.arch),
      sha256: String(row.sha256),
      path: String(row.path),
      sourceType: row.source_type as 'repository' | 'bundled',
      sourcePackageId: row.source_package_id ? String(row.source_package_id) : undefined,
      status: row.status as 'installed' | 'missing' | 'failed',
      installedAt: String(row.installed_at)
    }));
  }

  // --- Package Dependency Links ---
  linkPackageDependency(link: PackageDependencyLink): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO package_dependencies (
        package_id, dependency_id, required_version, resolved_version, resolved_sha256, source_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      link.packageId,
      link.dependencyId,
      link.requiredVersion,
      link.resolvedVersion ?? null,
      link.resolvedSha256 ? link.resolvedSha256.toLowerCase() : null,
      link.sourceType,
      link.status
    );
  }

  getPackageDependencies(packageId: string): PackageDependencyLink[] {
    const stmt = this.db.prepare(`
      SELECT package_id, dependency_id, required_version, resolved_version, resolved_sha256, source_type, status
      FROM package_dependencies WHERE package_id = ?
    `);
    const rows = stmt.all(packageId);
    return rows.map((row) => ({
      packageId: String(row.package_id),
      dependencyId: String(row.dependency_id),
      requiredVersion: String(row.required_version),
      resolvedVersion: row.resolved_version ? String(row.resolved_version) : undefined,
      resolvedSha256: row.resolved_sha256 ? String(row.resolved_sha256) : undefined,
      sourceType: row.source_type as 'repository' | 'bundled' | 'either',
      status: row.status as 'ready' | 'missing' | 'failed'
    }));
  }

  getAllPackageDependencies(): PackageDependencyLink[] {
    return this.db.prepare('SELECT package_id, dependency_id, required_version, resolved_version, resolved_sha256, source_type, status FROM package_dependencies').all().map((row) => ({
      packageId: String(row.package_id), dependencyId: String(row.dependency_id), requiredVersion: String(row.required_version),
      resolvedVersion: row.resolved_version ? String(row.resolved_version) : undefined, resolvedSha256: row.resolved_sha256 ? String(row.resolved_sha256) : undefined,
      sourceType: row.source_type as 'repository' | 'bundled' | 'either', status: row.status as 'ready' | 'missing' | 'failed'
    }));
  }

  // --- Prerequisites ---
  recordPrerequisite(record: WorkspacePrerequisiteRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO prerequisites (package_id, prerequisite_id, version, required, reason, detect)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(record.packageId, record.prerequisiteId, record.version, record.required ? 1 : 0, record.reason ?? null, record.detect ?? null);
  }

  getPrerequisites(packageId: string): WorkspacePrerequisiteRecord[] {
    return this.db.prepare(`
      SELECT package_id, prerequisite_id, version, required, reason, detect
      FROM prerequisites WHERE package_id = ?
    `).all(packageId).map((row) => ({
      packageId: String(row.package_id), prerequisiteId: String(row.prerequisite_id), version: String(row.version),
      required: Number(row.required) === 1,
      ...(row.reason ? { reason: String(row.reason) } : {}),
      ...(row.detect ? { detect: row.detect as 'plugin' | 'manual' } : {})
    }));
  }

  getAllPrerequisites(): WorkspacePrerequisiteRecord[] {
    return this.db.prepare('SELECT package_id, prerequisite_id, version, required, reason, detect FROM prerequisites').all().map((row) => ({
      packageId: String(row.package_id), prerequisiteId: String(row.prerequisite_id), version: String(row.version),
      required: Number(row.required) === 1,
      ...(row.reason ? { reason: String(row.reason) } : {}),
      ...(row.detect ? { detect: row.detect as 'plugin' | 'manual' } : {})
    }));
  }

  // --- Workspace Settings ---
  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value) VALUES (?, ?)
    `);
    stmt.run(key, value);
  }

  getSetting(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?');
    const row = stmt.get(key);
    return row ? String(row.value) : undefined;
  }
}
