import type { PackageDatabase, ReadingProgressRecord } from './database/package-db';

export interface ChapterProgressUpdate {
  scrollY?: number;
  progressPercent?: number;
  completed?: boolean;
}

function finiteNonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizedPercent(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function syncChapterProgress(db: PackageDatabase, chapterId: string, currentContentHash: string, update?: ChapterProgressUpdate): ReadingProgressRecord {
  if (!chapterId || chapterId.includes('\0')) throw new TypeError('chapterId must be a non-empty safe identifier');
  if (!currentContentHash || currentContentHash.includes('\0')) throw new TypeError('currentContentHash must be non-empty');
  const existing = db.getReadingProgress(chapterId);
  const now = new Date().toISOString();
  const normalizedHash = currentContentHash.toLowerCase();
  const contentChanged = existing && existing.contentHash.toLowerCase() !== normalizedHash;

  let record: ReadingProgressRecord;
  if (contentChanged) {
    // A content update invalidates all prior reading coordinates. The next explicit
    // completion action can mark the new content complete.
    record = { chapterId, scrollY: 0, progressPercent: 0, completed: false, contentHash: normalizedHash, updatedAt: now };
  } else if (existing) {
    let scrollY = existing.scrollY;
    let progressPercent = existing.progressPercent;
    let completed = existing.completed;
    let completedAt = existing.completedAt;
    if (update?.scrollY !== undefined) scrollY = finiteNonNegative(update.scrollY);
    if (update?.progressPercent !== undefined) {
      progressPercent = normalizedPercent(update.progressPercent);
      if (progressPercent >= 100 || (completed && update?.completed !== false)) {
        completed = true;
        completedAt = completedAt || now;
        progressPercent = 100;
      }
    }
    if (update?.completed !== undefined) {
      completed = update.completed;
      if (completed) { completedAt = completedAt || now; progressPercent = 100; }
      else { completedAt = undefined; progressPercent = Math.min(progressPercent, 99.999); }
    }
    record = { chapterId, scrollY: finiteNonNegative(scrollY), progressPercent: normalizedPercent(progressPercent), completed, completedAt, contentHash: normalizedHash, updatedAt: now };
  } else {
    const completed = update?.completed === true || normalizedPercent(update?.progressPercent) >= 100;
    record = {
      chapterId,
      scrollY: finiteNonNegative(update?.scrollY),
      progressPercent: completed ? 100 : normalizedPercent(update?.progressPercent),
      completed,
      completedAt: completed ? now : undefined,
      contentHash: normalizedHash,
      updatedAt: now
    };
  }
  db.saveReadingProgress(record);
  return record;
}

export function markChapterCompleted(db: PackageDatabase, chapterId: string, currentContentHash: string): ReadingProgressRecord {
  return syncChapterProgress(db, chapterId, currentContentHash, { completed: true, progressPercent: 100 });
}

export function markChapterUnread(db: PackageDatabase, chapterId: string, currentContentHash: string): ReadingProgressRecord {
  return syncChapterProgress(db, chapterId, currentContentHash, { completed: false, progressPercent: 0, scrollY: 0 });
}
