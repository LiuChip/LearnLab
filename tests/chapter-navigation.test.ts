import { describe, expect, it } from 'vitest';
import {
  buildChapterNavigationList,
  calculateScrollProgress,
  evaluatePluginReadonlyStatus,
  getNextChapter,
  getPreviousChapter
} from '../packages/core/src/chapter-navigation';
import type { PackageManifest } from '@learnlab/core-types';
import type { ReadingProgressRecord } from '../packages/core/src/database/package-db';
import { evaluatePluginResolutionStatus } from '../apps/desktop/src/renderer/utils/navigation';

describe('chapter navigation and reading utilities', () => {
  const manifest: PackageManifest = {
    id: 'com.example.sql',
    version: '1.0.0',
    name: 'SQL Basics',
    author: 'LearnLab',
    chapters: [
      { id: '01', title: '1. Select', file: '01.md', experiment_count: 2 },
      { id: '02', title: '2. Where', file: '02.md', experiment_count: 3 },
      { id: '03', title: '3. Group By', file: '03.md' }
    ],
    required_plugins: [
      { id: 'org.learnlab.mysql', version: '>=1.0.0' }
    ]
  };

  it('builds chapter navigation list with order, experiment counts, and progress', () => {
    const progress: ReadingProgressRecord[] = [
      {
        chapterId: '01',
        scrollY: 200,
        progressPercent: 100,
        completed: true,
        contentHash: 'hash1',
        updatedAt: '2026-09-10T00:00:00Z'
      },
      {
        chapterId: '02',
        scrollY: 100,
        progressPercent: 45,
        completed: false,
        contentHash: 'hash2',
        updatedAt: '2026-09-10T00:00:00Z'
      }
    ];

    const list = buildChapterNavigationList(manifest, progress);
    expect(list.length).toBe(3);

    // Ch1: orderIndex 1, experimentCount 2, completed true
    expect(list[0].id).toBe('01');
    expect(list[0].orderIndex).toBe(1);
    expect(list[0].experimentCount).toBe(2);
    expect(list[0].completed).toBe(true);
    expect(list[0].progressPercent).toBe(100);
    expect(list[0].scrollY).toBe(200);

    // Ch2: orderIndex 2, experimentCount 3, completed false
    expect(list[1].id).toBe('02');
    expect(list[1].orderIndex).toBe(2);
    expect(list[1].experimentCount).toBe(3);
    expect(list[1].completed).toBe(false);
    expect(list[1].progressPercent).toBe(45);
    expect(list[1].scrollY).toBe(100);

    // Ch3: default experimentCount 0 when omitted, unvisited
    expect(list[2].id).toBe('03');
    expect(list[2].orderIndex).toBe(3);
    expect(list[2].experimentCount).toBe(0);
    expect(list[2].completed).toBe(false);
    expect(list[2].progressPercent).toBe(0);
    expect(list[2].scrollY).toBe(0);
  });

  it('determines next and previous chapters correctly', () => {
    expect(getNextChapter(manifest.chapters, '01')?.id).toBe('02');
    expect(getNextChapter(manifest.chapters, '02')?.id).toBe('03');
    expect(getNextChapter(manifest.chapters, '03')).toBeNull();
    expect(getNextChapter(manifest.chapters, 'unknown')).toBeNull();

    expect(getPreviousChapter(manifest.chapters, '03')?.id).toBe('02');
    expect(getPreviousChapter(manifest.chapters, '02')?.id).toBe('01');
    expect(getPreviousChapter(manifest.chapters, '01')).toBeNull();
    expect(getPreviousChapter(manifest.chapters, 'unknown')).toBeNull();
  });

  it('calculates scroll progress and marks bottom completion', () => {
    // 1. Content fits without scrolling: automatically 100% and completed
    const fits = calculateScrollProgress(0, 400, 400);
    expect(fits.progressPercent).toBe(100);
    expect(fits.isAtBottom).toBe(true);

    // 2. Intermediate scrolling: scrollHeight 1000, clientHeight 500, scrollTop 250 -> 50%
    const mid = calculateScrollProgress(250, 1000, 500);
    expect(mid.progressPercent).toBe(50);
    expect(mid.isAtBottom).toBe(false);

    // 3. Reached bottom: scrollTop 498 (within 5px threshold of 500 max scroll)
    const bottom = calculateScrollProgress(498, 1000, 500);
    expect(bottom.progressPercent).toBe(100);
    expect(bottom.isAtBottom).toBe(true);
  });

  it('evaluates missing plugin status and generates informative readonly state', () => {
    // Missing org.learnlab.mysql
    const missing = evaluatePluginReadonlyStatus(manifest.required_plugins, []);
    expect(missing.isReadOnly).toBe(true);
    expect(missing.missingPlugins.length).toBe(1);
    expect(missing.reason).toContain('org.learnlab.mysql');
    expect(missing.reason).toContain('只读模式');

    // Installed
    const installed = evaluatePluginReadonlyStatus(manifest.required_plugins, ['org.learnlab.mysql']);
    expect(installed.isReadOnly).toBe(false);
    expect(installed.missingPlugins.length).toBe(0);

    // No required plugins
    const noReq = evaluatePluginReadonlyStatus(undefined, []);
    expect(noReq.isReadOnly).toBe(false);
  });

  it('maps plugin resolution issues and cycles to a readonly status', () => {
    const status = evaluatePluginResolutionStatus({
      loadOrder: [],
      active: [],
      issues: [
        {
          requirement: { id: 'org.mysql', version: '^1.0.0' },
          availableVersions: [],
          reason: 'missing'
        }
      ],
      cycles: [['org.a', 'org.b', 'org.a']],
      readOnly: true
    });

    expect(status.isReadOnly).toBe(true);
    expect(status.missingPlugins).toEqual(['org.mysql (^1.0.0)']);
    expect(status.reason).toContain('org.mysql (^1.0.0)');
    expect(status.reason).toContain('org.a -> org.b -> org.a');
  });
});
