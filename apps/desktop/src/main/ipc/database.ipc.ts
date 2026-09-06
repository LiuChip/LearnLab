import { ipcMain } from 'electron';
import {
  getExperimentAttempts, recordExperimentAttempt, syncChapterProgress,
  type ChapterProgressUpdate, type ExperimentAttemptDetail
} from '@learnlab/core';
import { DesktopDatabaseService } from '../services/database';
import { assertTrustedPackage, assertTrustedRenderer, requireIdentifier, requireNonEmptyString } from './security';

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validateProgressUpdate(value: unknown): ChapterProgressUpdate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError('Progress update must be an object');
  for (const key of ['scrollY', 'progressPercent']) if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key] as number))) throw new TypeError(`${key} must be a finite number`);
  if (value.completed !== undefined && typeof value.completed !== 'boolean') throw new TypeError('completed must be a boolean');
  return value as ChapterProgressUpdate;
}
function validateAttempt(value: unknown): ExperimentAttemptDetail {
  if (!isRecord(value)) throw new TypeError('Experiment attempt must be an object');
  const required = ['attemptId', 'labId', 'chapterId', 'status', 'timestamp'];
  for (const key of required) requireNonEmptyString(value[key], `attempt.${key}`);
  if (!['passed', 'failed', 'running'].includes(String(value.status))) throw new TypeError('attempt.status is invalid');
  if (value.durationMs !== undefined && (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0)) throw new TypeError('attempt.durationMs is invalid');
  return value as unknown as ExperimentAttemptDetail;
}

export function registerDatabaseIpc(): void {
  ipcMain.handle('database:get-reading-progress', async (event, packageDir: string, chapterId: string) => {
    assertTrustedRenderer(event);
    const db = DesktopDatabaseService.getPackageDb(assertTrustedPackage(packageDir));
    return db.getReadingProgress(requireIdentifier(chapterId, 'chapterId'));
  });
  ipcMain.handle('database:save-reading-progress', async (event, packageDir: string, chapterId: string, contentHash: string, update?: ChapterProgressUpdate) => {
    assertTrustedRenderer(event);
    const db = DesktopDatabaseService.getPackageDb(assertTrustedPackage(packageDir));
    return syncChapterProgress(db, requireIdentifier(chapterId, 'chapterId'), requireNonEmptyString(contentHash, 'contentHash'), validateProgressUpdate(update));
  });
  ipcMain.handle('database:get-all-progress', async (event, packageDir: string) => {
    assertTrustedRenderer(event);
    return DesktopDatabaseService.getPackageDb(assertTrustedPackage(packageDir)).getAllReadingProgress();
  });
  ipcMain.handle('database:record-experiment-attempt', async (event, packageDir: string, attempt: ExperimentAttemptDetail) => {
    assertTrustedRenderer(event);
    const trustedPackageDir = assertTrustedPackage(packageDir);
    return recordExperimentAttempt({ packageDir: trustedPackageDir, attempt: validateAttempt(attempt), db: DesktopDatabaseService.getPackageDb(trustedPackageDir) });
  });
  ipcMain.handle('database:get-experiment-attempts', async (event, packageDir: string, labId: string) => {
    assertTrustedRenderer(event);
    return getExperimentAttempts(assertTrustedPackage(packageDir), requireIdentifier(labId, 'labId'));
  });
}
