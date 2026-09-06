import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface PreparedStatement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

export interface DatabaseConnection {
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  transaction<T>(operation: () => T): T;
  close(): void;
  isMemory(): boolean;
  getPath(): string;
}

const requireModule = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nodeSqlite: any = null;
try {
  nodeSqlite = requireModule('node:sqlite');
} catch {
  nodeSqlite = null;
}

class NodeSqliteConnection implements DatabaseConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new nodeSqlite.DatabaseSync(dbPath);
  }

  exec(sql: string): void { this.db.exec(sql); }

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: unknown[]) => {
        const res = stmt.run(...params);
        return { changes: Number(res.changes || 0), lastInsertRowid: res.lastInsertRowid ?? 0 };
      },
      get: (...params: unknown[]) => (stmt.get(...params) as Record<string, unknown>) || undefined,
      all: (...params: unknown[]) => (stmt.all(...params) as Record<string, unknown>[]) || []
    };
  }

  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    }
  }

  close(): void { this.db.close(); }
  isMemory(): boolean { return this.dbPath === ':memory:'; }
  getPath(): string { return this.dbPath; }
}

interface PortableTable {
  columns: string[];
  primaryKeys: string[];
  rows: Record<string, unknown>[];
}

function splitTopLevel(input: string, delimiter = ','): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote && input[i - 1] !== '\\') quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === delimiter && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

function splitStatements(sql: string): string[] {
  return splitTopLevel(sql.replace(/\r\n/g, '\n'), ';');
}

function cloneTables(tables: Record<string, PortableTable>): Record<string, PortableTable> {
  return JSON.parse(JSON.stringify(tables)) as Record<string, PortableTable>;
}

class PortableDatabaseConnection implements DatabaseConnection {
  private readonly dbPath: string;
  private tables: Record<string, PortableTable> = {};
  private isOpen = true;
  private transactionDepth = 0;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
      this.loadFromFile();
    }
  }

  private getPersistenceFile(): string { return path.resolve(this.dbPath); }

  private loadFromFile(): void {
    let file = this.getPersistenceFile();
    // Read the old sidecar format once so existing portable databases can be upgraded.
    if (!existsSync(file) && existsSync(`${file}.json`)) file = `${file}.json`;
    if (!existsSync(file)) return;
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { throw new Error(`Portable database is corrupted: ${file}`, { cause: error }); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Portable database has an invalid format: ${file}`);
    }
    const tables = parsed as Record<string, unknown>;
    for (const [name, table] of Object.entries(tables)) {
      if (!table || typeof table !== 'object' || !Array.isArray((table as { columns?: unknown }).columns) ||
          !Array.isArray((table as { rows?: unknown }).rows)) {
        throw new Error(`Portable database table is invalid: ${name}`);
      }
    }
    this.tables = parsed as Record<string, PortableTable>;
  }

  private saveToFile(): void {
    if (this.dbPath === ':memory:' || !this.isOpen || this.transactionDepth > 0) return;
    const file = this.getPersistenceFile();
    const temp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      writeFileSync(temp, JSON.stringify(this.tables, null, 2), 'utf8');
      renameSync(temp, file);
    } catch (error) {
      try { if (existsSync(temp)) renameSync(temp, `${temp}.failed`); } catch { /* best effort */ }
      throw new Error(`Failed to persist portable database: ${file}`, { cause: error });
    }
  }

  exec(sql: string): void { for (const stmt of splitStatements(sql)) this.executeStatement(stmt); }

  private executeStatement(rawSql: string): void {
    const s = rawSql.trim();
    if (!s) return;
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)) return;

    const createMatch = s.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]+)\)$/i);
    if (createMatch) {
      const tableName = createMatch[1];
      if (!this.tables[tableName]) {
        const columns: string[] = [];
        const primaryKeys: string[] = [];
        for (const part of splitTopLevel(createMatch[2])) {
          const pkMatch = part.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
          if (pkMatch) { primaryKeys.push(...splitTopLevel(pkMatch[1])); continue; }
          const colName = part.split(/\s+/)[0];
          if (colName) {
            columns.push(colName);
            if (/\bPRIMARY\s+KEY\b/i.test(part)) primaryKeys.push(colName);
          }
        }
        this.tables[tableName] = { columns, primaryKeys, rows: [] };
        this.saveToFile();
      }
      return;
    }
    throw new Error(`Unsupported portable SQL: ${s}`);
  }

  prepare(sql: string): PreparedStatement {
    return {
      run: (...params: unknown[]) => this.runStatement(sql, params),
      get: (...params: unknown[]) => this.getQuery(sql, params),
      all: (...params: unknown[]) => this.allQuery(sql, params)
    };
  }

  private runStatement(sql: string, params: unknown[]): RunResult {
    const s = sql.trim();
    const insertMatch = s.match(/^INSERT\s+(OR\s+REPLACE\s+)?INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)$/i);
    if (insertMatch) {
      const replaceExisting = Boolean(insertMatch[1]);
      const table = this.tables[insertMatch[2]];
      if (!table) throw new Error(`Table ${insertMatch[2]} does not exist`);
      const columns = splitTopLevel(insertMatch[3]).map((c) => c.trim());
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => { row[column] = params[index]; });
      const existing = table.primaryKeys.length > 0
        ? table.rows.findIndex((candidate) => table.primaryKeys.every((key) => candidate[key] === row[key]))
        : -1;
      if (existing >= 0) {
        if (!replaceExisting) throw new Error(`Constraint failed: duplicate primary key in ${insertMatch[2]}`);
        table.rows.splice(existing, 1, row);
      } else table.rows.push(row);
      this.saveToFile();
      return { changes: 1, lastInsertRowid: table.rows.length };
    }

    const updateMatch = s.match(/^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (updateMatch) {
      const table = this.tables[updateMatch[1]];
      if (!table) throw new Error(`Table ${updateMatch[1]} does not exist`);
      const assignments = splitTopLevel(updateMatch[2]);
      const updates: Record<string, unknown> = {};
      let paramIdx = 0;
      for (const assignment of assignments) updates[assignment.split('=')[0].trim()] = params[paramIdx++];
      const whereParams = params.slice(paramIdx);
      let changes = 0;
      for (const row of table.rows) {
        if (!updateMatch[3] || this.matchesWhere(row, updateMatch[3], whereParams)) { Object.assign(row, updates); changes += 1; }
      }
      this.saveToFile();
      return { changes, lastInsertRowid: 0 };
    }

    const deleteMatch = s.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (deleteMatch) {
      const table = this.tables[deleteMatch[1]];
      if (!table) throw new Error(`Table ${deleteMatch[1]} does not exist`);
      const before = table.rows.length;
      table.rows = deleteMatch[2] ? table.rows.filter((row) => !this.matchesWhere(row, deleteMatch[2], params)) : [];
      this.saveToFile();
      return { changes: before - table.rows.length, lastInsertRowid: 0 };
    }
    throw new Error(`Unsupported portable SQL: ${s}`);
  }

  private getQuery(sql: string, params: unknown[]): Record<string, unknown> | undefined { return this.allQuery(sql, params)[0]; }

  private allQuery(sql: string, params: unknown[]): Record<string, unknown>[] {
    const selectMatch = sql.trim().match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?$/i);
    if (!selectMatch) throw new Error(`Unsupported portable SQL: ${sql}`);
    const table = this.tables[selectMatch[2]];
    if (!table) throw new Error(`Table ${selectMatch[2]} does not exist`);
    let rows = table.rows.filter((row) => !selectMatch[3] || this.matchesWhere(row, selectMatch[3], params));
    if (selectMatch[4]) {
      const [column, direction] = selectMatch[4].trim().split(/\s+/);
      const desc = direction?.toUpperCase() === 'DESC';
      rows = [...rows].sort((a, b) => {
        if (a[column] === b[column]) return 0;
        if (a[column] === undefined) return 1;
        if (b[column] === undefined) return -1;
        const left = a[column] as string | number;
        const right = b[column] as string | number;
        return (left > right ? 1 : -1) * (desc ? -1 : 1);
      });
    }
    if (selectMatch[5]) rows = rows.slice(0, Number(selectMatch[5]));
    if (selectMatch[1].trim() === '*') return rows.map((row) => ({ ...row }));
    const columns = splitTopLevel(selectMatch[1].trim());
    return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
  }

  private matchesWhere(row: Record<string, unknown>, whereClause: string, params: unknown[]): boolean {
    const conditions = whereClause.split(/\s+AND\s+/i);
    let paramIdx = 0;
    for (const condition of conditions) {
      const trimmed = condition.trim();
      const parameterMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*(=|!=|<>)\s*\?$/);
      const literalMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*(=|!=|<>)\s*'([^']*)'$/);
      const match = parameterMatch ?? literalMatch;
      if (!match) throw new Error(`Unsupported portable WHERE clause: ${trimmed}`);
      const value = parameterMatch ? params[paramIdx++] : literalMatch?.[3];
      const equal = row[match[1]] === value;
      if ((match[2] === '=' && !equal) || (match[2] !== '=' && equal)) return false;
    }
    return true;
  }

  transaction<T>(operation: () => T): T {
    const snapshot = cloneTables(this.tables);
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.transactionDepth -= 1;
      this.saveToFile();
      return result;
    } catch (error) {
      this.tables = snapshot;
      this.transactionDepth -= 1;
      this.saveToFile();
      throw error;
    }
  }

  close(): void { this.saveToFile(); this.isOpen = false; }
  isMemory(): boolean { return this.dbPath === ':memory:'; }
  getPath(): string { return this.dbPath; }
}

function looksLikePortableDatabase(dbPath: string): boolean {
  if (dbPath === ':memory:' || !existsSync(dbPath)) return false;
  try { return readFileSync(dbPath, 'utf8').trimStart().startsWith('{'); } catch { return false; }
}

export function createDatabaseConnection(dbPath: string, options?: { forcePortable?: boolean }): DatabaseConnection {
  if (options?.forcePortable || !nodeSqlite || looksLikePortableDatabase(dbPath)) return new PortableDatabaseConnection(dbPath);
  return new NodeSqliteConnection(dbPath);
}
