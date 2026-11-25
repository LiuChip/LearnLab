import * as path from 'node:path';
import { PackageDatabase } from '@learnlab/core';

export class DesktopDatabaseService {
  private static packageDbs = new Map<string, PackageDatabase>();
  static getPackageDb(packageDir: string): PackageDatabase {
    const key = path.resolve(packageDir);
    let db = this.packageDbs.get(key);
    if (!db) { db = PackageDatabase.open(key); this.packageDbs.set(key, db); }
    return db;
  }
  static closeAll(): void {
    for (const db of this.packageDbs.values()) db.close();
    this.packageDbs.clear();
  }
}
