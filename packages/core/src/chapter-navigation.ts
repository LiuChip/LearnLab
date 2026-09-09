import type {
  ChapterEntry,
  PackageManifest,
  PluginRequirement
} from '@learnlab/core-types';
import type { ReadingProgressRecord } from './database/package-db';

export interface ChapterNavigationItem {
  id: string;
  title: string;
  file: string;
  orderIndex: number;
  experimentCount: number;
  progressPercent: number;
  completed: boolean;
  completedAt?: string;
}

export interface ScrollProgressResult {
  scrollY: number;
  progressPercent: number;
  isAtBottom: boolean;
}

export interface PluginReadonlyStatus {
  isReadOnly: boolean;
  missingPlugins: string[];
  reason?: string;
}

export function buildChapterNavigationList(
  manifest: PackageManifest,
  progressRecords: ReadingProgressRecord[] = []
): ChapterNavigationItem[] {
  const progressMap = new Map<string, ReadingProgressRecord>();
  for (const record of progressRecords) {
    progressMap.set(record.chapterId, record);
  }

  return manifest.chapters.map((chapter, index) => {
    const record = progressMap.get(chapter.id);
    const experimentCount =
      chapter.experiment_count !== undefined && chapter.experiment_count >= 0
        ? chapter.experiment_count
        : 0;

    return {
      id: chapter.id,
      title: chapter.title,
      file: chapter.file,
      orderIndex: index + 1,
      experimentCount,
      progressPercent: record?.progressPercent ?? 0,
      completed: record?.completed ?? false,
      completedAt: record?.completedAt
    };
  });
}

export function getNextChapter(
  chapters: ChapterEntry[],
  currentChapterId: string
): ChapterEntry | null {
  const index = chapters.findIndex((item) => item.id === currentChapterId);
  if (index === -1 || index >= chapters.length - 1) {
    return null;
  }
  return chapters[index + 1];
}

export function getPreviousChapter(
  chapters: ChapterEntry[],
  currentChapterId: string
): ChapterEntry | null {
  const index = chapters.findIndex((item) => item.id === currentChapterId);
  if (index <= 0) {
    return null;
  }
  return chapters[index - 1];
}

export function calculateScrollProgress(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): ScrollProgressResult {
  const safeTop = Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0;
  const safeHeight = Number.isFinite(scrollHeight) && scrollHeight > 0 ? scrollHeight : 0;
  const safeClient = Number.isFinite(clientHeight) && clientHeight > 0 ? clientHeight : 0;

  // If content is shorter than or equal to container, viewing it counts as 100% complete
  if (safeHeight <= safeClient + 1) {
    return {
      scrollY: 0,
      progressPercent: 100,
      isAtBottom: true
    };
  }

  const maxScroll = safeHeight - safeClient;
  // 5px threshold for sub-pixel precision and bottom detection
  const isAtBottom = safeTop + safeClient >= safeHeight - 5;

  let progressPercent: number;
  if (isAtBottom) {
    progressPercent = 100;
  } else {
    progressPercent = Math.min(99.9, Math.max(0, (safeTop / maxScroll) * 100));
    progressPercent = Math.round(progressPercent * 10) / 10;
  }

  return {
    scrollY: safeTop,
    progressPercent,
    isAtBottom
  };
}

export function evaluatePluginReadonlyStatus(
  requiredPlugins: PluginRequirement[] | undefined,
  installedPluginIds: Iterable<string>
): PluginReadonlyStatus {
  if (!requiredPlugins || requiredPlugins.length === 0) {
    return {
      isReadOnly: false,
      missingPlugins: []
    };
  }

  const installed = new Set(installedPluginIds);
  const missing: string[] = [];

  for (const req of requiredPlugins) {
    if (!installed.has(req.id)) {
      missing.push(`${req.id} (${req.version})`);
    }
  }

  if (missing.length === 0) {
    return {
      isReadOnly: false,
      missingPlugins: []
    };
  }

  return {
    isReadOnly: true,
    missingPlugins: missing,
    reason: `缺少所需插件：${missing.join(', ')}。当前处于只读模式，可以正常阅读 Markdown，但实验环境暂不可用。`
  };
}
