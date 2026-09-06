import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { PackageDatabase } from './database/package-db';

export interface ExperimentStepRecord { name: string; status: 'passed' | 'failed' | 'skipped'; message?: string; }
export interface ExperimentAttemptDetail {
  attemptId: string; labId: string; chapterId: string; status: 'passed' | 'failed' | 'running'; timestamp: string;
  durationMs?: number; input?: string; output?: string; error?: string; steps?: ExperimentStepRecord[];
}
export interface SaveAttemptOptions { packageDir: string; attempt: ExperimentAttemptDetail; db?: PackageDatabase; }

function safeIdentifier(value: string, label: string): string {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new TypeError(`${label} must be a safe non-empty identifier`);
  }
  return value;
}

function safeTimestamp(value: string): string {
  if (!value || value.includes('/') || value.includes('\\') || value.includes('\0')) throw new TypeError('timestamp must not contain path separators');
  return value.replace(/[:.]/g, '-').replace(/\.\./g, '--');
}

export function getExperimentHistoryDir(packageDir: string, labId?: string): string {
  const base = path.join(path.resolve(packageDir), 'experiment_history');
  return labId === undefined ? base : path.join(base, safeIdentifier(labId, 'labId'));
}

export async function recordExperimentAttempt(options: SaveAttemptOptions): Promise<string> {
  const { packageDir, attempt, db } = options;
  const labId = safeIdentifier(attempt.labId, 'labId');
  const attemptId = safeIdentifier(attempt.attemptId, 'attemptId');
  const fileName = `attempt-${safeTimestamp(attempt.timestamp)}-${attemptId}.json`;
  const labHistoryDir = getExperimentHistoryDir(packageDir, labId);
  await mkdir(labHistoryDir, { recursive: true });
  const filePath = path.join(labHistoryDir, fileName);
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, JSON.stringify(attempt, null, 2), 'utf8');
    await rename(temporaryPath, filePath);
  } finally { await rm(temporaryPath, { force: true }).catch(() => undefined); }

  if (db) {
    const existing = db.getLabSummary(labId);
    db.saveLabSummary({ labId, chapterId: attempt.chapterId, status: attempt.status, attemptCount: (existing?.attemptCount ?? 0) + 1, lastAttemptAt: attempt.timestamp });
  }
  return filePath;
}

export async function getExperimentAttempts(packageDir: string, labId: string): Promise<ExperimentAttemptDetail[]> {
  const labHistoryDir = getExperimentHistoryDir(packageDir, safeIdentifier(labId, 'labId'));
  try {
    const files = await readdir(labHistoryDir);
    const attempts: ExperimentAttemptDetail[] = [];
    for (const file of files.filter((name) => name.startsWith('attempt-') && name.endsWith('.json'))) {
      try {
        const parsed = JSON.parse(await readFile(path.join(labHistoryDir, file), 'utf8')) as ExperimentAttemptDetail;
        if (parsed.labId === labId && parsed.attemptId && parsed.timestamp) attempts.push(parsed);
      } catch { /* ignore a single damaged history record, but never traverse outside the lab dir */ }
    }
    attempts.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return attempts;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function clearExperimentHistory(packageDir: string, labId?: string): Promise<void> {
  await rm(getExperimentHistoryDir(packageDir, labId), { recursive: true, force: true });
}
