import * as path from 'node:path';
import { PackageDatabase, WorkspaceDatabase } from '@learnlab/core';

export class DesktopDatabaseService {
  private static workspaceDbs = new Map<string, WorkspaceDatabase>();
  private static packageDbs = new Map<string, PackageDatabase>();
  static getWorkspaceDb(workspaceDir: string): WorkspaceDatabase {
    const key = path.resolve(workspaceDir);
    let db = this.workspaceDbs.get(key);
    if (!db) { db = WorkspaceDatabase.open(key); this.workspaceDbs.set(key, db); }
    return db;
  }
  static getPackageDb(packageDir: string): PackageDatabase {
    const key = path.resolve(packageDir);
    let db = this.packageDbs.get(key);
    if (!db) { db = PackageDatabase.open(key); this.packageDbs.set(key, db); }
    return db;
  }
  static closeAll(): void {
    for (const db of this.workspaceDbs.values()) db.close();
    this.workspaceDbs.clear();
    for (const db of this.packageDbs.values()) db.close();
    this.packageDbs.clear();
  }
}
