import { useState, useCallback, useRef } from 'preact/hooks';
import {
  parseExperimentMarkers,
  parseMarkdown,
  stepMatchIndex,
  type ExperimentParseResult,
  type MarkdownResult
} from '@learnlab/markdown';
import type { PluginManifest } from '@learnlab/core-types';

const NO_EXPERIMENTS: ExperimentParseResult = { experiments: [], errors: [] };
import {
  calculateScrollProgress,
  evaluatePluginResolutionStatus,
  getNextChapter,
  getPreviousChapter,
  type ChapterNavigationItem,
  type PluginReadonlyStatus
} from '../utils/navigation';

export interface ReadingError {
  type: string;
  message: string;
}

const EMPTY_PLUGIN_STATUS: PluginReadonlyStatus = {
  isReadOnly: false,
  missingPlugins: []
};

export function useReadingStore() {
  const [packageDir, setPackageDir] = useState<string | null>(null);
  const [packageName, setPackageName] = useState<string>('LearnLab');
  const [chapters, setChapters] = useState<ChapterNavigationItem[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<MarkdownResult | null>(null);
  const [experiments, setExperiments] = useState<ExperimentParseResult>(NO_EXPERIMENTS);
  const [contentHash, setContentHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ReadingError | null>(null);
  const [readonlyStatus, setReadonlyStatus] = useState<PluginReadonlyStatus>({
    isReadOnly: false,
    missingPlugins: []
  });
  const [loadedPluginCount, setLoadedPluginCount] = useState(0);
  const [activePlugins, setActivePlugins] = useState<PluginManifest[]>([]);

  // Search state
  const [searchQuery, setSearchQueryState] = useState<string>('');
  const [searchOptions, setSearchOptions] = useState<{
    caseSensitive: boolean;
    wholeWord: boolean;
    isRegex: boolean;
  }>({
    caseSensitive: false,
    wholeWord: false,
    isRegex: false
  });
  // Current-file find state: matches live in the rendered chapter, so the
  // reader reports the total and the store only tracks the active index.
  const [findIndex, setFindIndex] = useState(-1);
  const [findTotal, setFindTotal] = useState(0);

  // Copy code feedback
  const [copyStatus, setCopyStatus] = useState<{
    id: string;
    status: 'copied' | 'error';
    message?: string;
  } | null>(null);

  const activePackageDirRef = useRef<string | null>(null);
  const packageRequestRef = useRef(0);

  const refreshChapters = useCallback(async (pkgDir: string, requestId?: number) => {
    try {
      const list = await window.learnlab.package.listChapters(pkgDir);
      if (activePackageDirRef.current !== pkgDir) return;
      if (requestId !== undefined && packageRequestRef.current !== requestId) return;
      setChapters(list);
    } catch {
      // If listChapters fails, fallback to loaded package manifest
    }
  }, []);

  const loadPackageByPath = useCallback(
    async (dir: string, preferredChapterId?: string) => {
      const requestId = packageRequestRef.current + 1;
      packageRequestRef.current = requestId;
      activePackageDirRef.current = dir;
      setIsLoading(true);
      setError(null);
      setPackageDir(dir);
      setPackageName('LearnLab');
      setChapters([]);
      setActiveChapterId(null);
      setMarkdown(null);
      setContentHash(null);
      setReadonlyStatus(EMPTY_PLUGIN_STATUS);
      setLoadedPluginCount(0);
      setActivePlugins([]);
      setCopyStatus(null);
      setFindIndex(-1);
      setFindTotal(0);
      setExperiments(NO_EXPERIMENTS);

      try {
        const loaded = await window.learnlab.loadPackage(dir);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
        if (!loaded.ok) {
          setError({ type: loaded.error.type, message: loaded.error.message });
          return;
        }

        const manifest = loaded.value.manifest;
        setPackageName(manifest.name);

        // Plugin resolution includes global plugins and the package dependency chain.
        try {
          const resolution = await window.learnlab.plugins.resolveForPackage(dir);
          if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
          setLoadedPluginCount(resolution.active.length);
          setActivePlugins(resolution.active);
          setReadonlyStatus(evaluatePluginResolutionStatus(resolution));
        } catch (cause) {
          if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
          setReadonlyStatus({
            isReadOnly: true,
            missingPlugins: [],
            reason: `插件解析失败：${cause instanceof Error ? cause.message : String(cause)}。当前处于只读模式，可以正常阅读 Markdown，但实验环境暂不可用。`
          });
          setLoadedPluginCount(0);
        }

        // Refresh chapter navigation list
        const chapterList = await window.learnlab.package.listChapters(dir);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
        setChapters(chapterList);

        if (chapterList.length === 0) {
          setActiveChapterId(null);
          setMarkdown(null);
          return;
        }

        const targetChapter =
          chapterList.find((c) => c.id === preferredChapterId) ?? chapterList[0];
        setActiveChapterId(targetChapter.id);

        // Read target chapter
        const readResult = await window.learnlab.readChapter(dir, targetChapter.file);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
        if (!readResult.ok) {
          setError({ type: readResult.error.type, message: readResult.error.message });
          return;
        }

        const { content, contentHash: hash } = readResult.value;
        setContentHash(hash);

        // Sync with database for fingerprint invalidation
        await window.learnlab.database.saveReadingProgress(dir, targetChapter.id, hash);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;

        const parsed = await parseMarkdown(content);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
        setMarkdown(parsed);
        setExperiments(parseExperimentMarkers(content));

        // Refresh list to reflect any fingerprint reset
        const updatedList = await window.learnlab.package.listChapters(dir);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
        setChapters(updatedList);
      } catch (cause) {
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== dir) return;
        setError({
          type: 'read_error',
          message: cause instanceof Error ? cause.message : String(cause)
        });
      } finally {
        if (packageRequestRef.current === requestId && activePackageDirRef.current === dir) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const selectChapter = useCallback(
    async (chapterId: string) => {
      const currentDir = activePackageDirRef.current;
      if (!currentDir || packageDir !== currentDir) return;

      const target = chapters.find((c) => c.id === chapterId);
      if (!target) return;

      const requestId = packageRequestRef.current + 1;
      packageRequestRef.current = requestId;
      setIsLoading(true);
      setError(null);
      setActiveChapterId(chapterId);
      setMarkdown(null);
      setContentHash(null);
      setFindIndex(-1);
      setFindTotal(0);
      setExperiments(NO_EXPERIMENTS);

      try {
        const readResult = await window.learnlab.readChapter(currentDir, target.file);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== currentDir) return;
        if (!readResult.ok) {
          setError({ type: readResult.error.type, message: readResult.error.message });
          return;
        }

        const { content, contentHash: hash } = readResult.value;
        setContentHash(hash);

        await window.learnlab.database.saveReadingProgress(currentDir, target.id, hash);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== currentDir) return;

        const parsed = await parseMarkdown(content);
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== currentDir) return;
        setMarkdown(parsed);
        setExperiments(parseExperimentMarkers(content));

        await refreshChapters(currentDir, requestId);
      } catch (cause) {
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== currentDir) return;
        setError({
          type: 'read_error',
          message: cause instanceof Error ? cause.message : String(cause)
        });
      } finally {
        if (packageRequestRef.current === requestId && activePackageDirRef.current === currentDir) {
          setIsLoading(false);
        }
      }
    },
    [chapters, packageDir, refreshChapters]
  );

  const clearView = useCallback((nextError?: ReadingError) => {
    packageRequestRef.current += 1;
    activePackageDirRef.current = null;
    setPackageDir(null);
    setPackageName('LearnLab');
    setChapters([]);
    setActiveChapterId(null);
    setMarkdown(null);
    setContentHash(null);
    setReadonlyStatus(EMPTY_PLUGIN_STATUS);
    setLoadedPluginCount(0);
    setSearchQuery('');
    setCopyStatus(null);
    setFindIndex(-1);
    setFindTotal(0);
    setExperiments(NO_EXPERIMENTS);
    setError(nextError ?? null);
    setIsLoading(false);
  }, []);

  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? null;
  const prevChapter = activeChapterId
    ? getPreviousChapter(
        chapters.map((c) => ({ id: c.id, title: c.title, file: c.file })),
        activeChapterId
      )
    : null;
  const nextChapter = activeChapterId
    ? getNextChapter(
        chapters.map((c) => ({ id: c.id, title: c.title, file: c.file })),
        activeChapterId
      )
    : null;

  const updateScroll = useCallback(
    async (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      const currentDir = activePackageDirRef.current;
      const requestId = packageRequestRef.current;
      if (!currentDir || !activeChapterId || !contentHash) return;

      const calc = calculateScrollProgress(scrollTop, scrollHeight, clientHeight);
      const isAlreadyCompleted = activeChapter?.completed ?? false;
      const isCompleted = isAlreadyCompleted || calc.isAtBottom;
      const newPercent = isCompleted ? 100 : Math.max(activeChapter?.progressPercent ?? 0, calc.progressPercent);

      const prevScrollY = activeChapter?.scrollY ?? 0;
      const shouldUpdate =
        calc.isAtBottom ||
        Math.abs(newPercent - (activeChapter?.progressPercent ?? 0)) >= 1 ||
        Math.abs(calc.scrollY - prevScrollY) >= 50;

      if (shouldUpdate) {
        await window.learnlab.database.saveReadingProgress(currentDir, activeChapterId, contentHash, {
          scrollY: calc.scrollY,
          progressPercent: newPercent,
          completed: isCompleted ? true : undefined
        });
        if (packageRequestRef.current !== requestId || activePackageDirRef.current !== currentDir) return;
        await refreshChapters(currentDir, requestId);
      }
    },
    [activeChapterId, contentHash, activeChapter, refreshChapters]
  );

  const toggleCompleted = useCallback(
    async (completed: boolean) => {
      const currentDir = activePackageDirRef.current;
      const requestId = packageRequestRef.current;
      if (!currentDir || !activeChapterId || !contentHash) return;

      await window.learnlab.database.saveReadingProgress(currentDir, activeChapterId, contentHash, {
        completed,
        progressPercent: completed ? 100 : 0,
        scrollY: completed ? (activeChapter?.scrollY ?? 0) : 0
      });
      if (packageRequestRef.current !== requestId || activePackageDirRef.current !== currentDir) return;
      await refreshChapters(currentDir, requestId);
    },
    [activeChapterId, contentHash, activeChapter, refreshChapters]
  );

  const toggleSearchOption = useCallback(
    (key: 'caseSensitive' | 'wholeWord' | 'isRegex') => {
      setFindIndex(-1);
      setSearchOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setFindIndex(-1);
    if (!query.trim()) setFindTotal(0);
  }, []);

  const stepFind = useCallback(
    (direction: 'next' | 'previous') => {
      setFindIndex((current) => stepMatchIndex(current, findTotal, direction));
    },
    [findTotal]
  );

  // Called by the reader after it highlights; keeps the active index in range.
  const reportFindTotal = useCallback((total: number) => {
    setFindTotal(total);
    setFindIndex((current) => (total === 0 ? -1 : current >= total ? 0 : current < 0 ? 0 : current));
  }, []);

  const copyCodeToClipboard = useCallback(async (code: string, codeId: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!success) throw new Error('execCommand copy failed');
      }
      setCopyStatus({ id: codeId, status: 'copied' });
      setTimeout(() => {
        setCopyStatus((curr) => (curr?.id === codeId ? null : curr));
      }, 2000);
    } catch {
      setCopyStatus({
        id: codeId,
        status: 'error',
        message: '无法访问剪贴板，请检查应用系统权限。'
      });
      setTimeout(() => {
        setCopyStatus((curr) => (curr?.id === codeId ? null : curr));
      }, 4000);
    }
  }, []);

  return {
    packageDir,
    packageName,
    chapters,
    activeChapterId,
    activeChapter,
    prevChapter,
    nextChapter,
    markdown,
    contentHash,
    isLoading,
    error,
    readonlyStatus,
    loadedPluginCount,
    activePlugins,
    searchQuery,
    setSearchQuery,
    searchOptions,
    experiments,
    findIndex,
    findTotal,
    stepFind,
    reportFindTotal,
    copyStatus,
    loadPackageByPath,
    selectChapter,
    clearView,
    updateScroll,
    toggleCompleted,
    toggleSearchOption,
    copyCodeToClipboard
  };
}
