import { useState, useCallback, useRef } from 'preact/hooks';
import { parseMarkdown, type MarkdownResult } from '@learnlab/markdown';
import {
  calculateScrollProgress,
  evaluatePluginResolutionStatus,
  getNextChapter,
  getPreviousChapter,
  type ChapterNavigationItem,
  type PluginReadonlyStatus
} from '../utils/navigation';
import type { SearchOptions, SearchResult } from '@learnlab/core';

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
  const [contentHash, setContentHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ReadingError | null>(null);
  const [readonlyStatus, setReadonlyStatus] = useState<PluginReadonlyStatus>({
    isReadOnly: false,
    missingPlugins: []
  });
  const [loadedPluginCount, setLoadedPluginCount] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchOptions, setSearchOptions] = useState<{
    caseSensitive: boolean;
    wholeWord: boolean;
    isRegex: boolean;
  }>({
    caseSensitive: false,
    wholeWord: false,
    isRegex: false
  });
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Copy code feedback
  const [copyStatus, setCopyStatus] = useState<{
    id: string;
    status: 'copied' | 'error';
    message?: string;
  } | null>(null);

  const activePackageDirRef = useRef<string | null>(null);
  const packageRequestRef = useRef(0);
  const searchRequestRef = useRef(0);

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
      searchRequestRef.current += 1;
      setSearchResults(null);
      setIsSearching(false);

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
    searchRequestRef.current += 1;
    activePackageDirRef.current = null;
    setPackageDir(null);
    setPackageName('LearnLab');
    setChapters([]);
    setActiveChapterId(null);
    setMarkdown(null);
    setContentHash(null);
    setReadonlyStatus(EMPTY_PLUGIN_STATUS);
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
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

  const runSearch = useCallback(
    async (queryText: string, opts?: Partial<SearchOptions>) => {
      const currentDir = activePackageDirRef.current;
      if (!currentDir) return;
      const packageRequestId = packageRequestRef.current;
      const searchRequestId = searchRequestRef.current + 1;
      searchRequestRef.current = searchRequestId;

      const mergedOpts: SearchOptions = {
        query: queryText,
        caseSensitive: opts?.caseSensitive ?? searchOptions.caseSensitive,
        wholeWord: opts?.wholeWord ?? searchOptions.wholeWord,
        isRegex: opts?.isRegex ?? searchOptions.isRegex
      };

      setIsSearching(true);
      try {
        const result = await window.learnlab.package.search(currentDir, mergedOpts);
        if (
          packageRequestRef.current !== packageRequestId ||
          activePackageDirRef.current !== currentDir ||
          searchRequestRef.current !== searchRequestId
        ) return;
        setSearchResults(result);
      } catch (err) {
        if (
          packageRequestRef.current !== packageRequestId ||
          activePackageDirRef.current !== currentDir ||
          searchRequestRef.current !== searchRequestId
        ) return;
        setSearchResults({
          matches: [],
          totalMatches: 0,
          searchedChapters: 0,
          searchedPackages: 0,
          skippedChapters: 0,
          skippedPackages: 0,
          warnings: [],
          error: err instanceof Error ? err.message : String(err)
        });
      } finally {
        if (searchRequestRef.current === searchRequestId) setIsSearching(false);
      }
    },
    [searchOptions]
  );

  const toggleSearchOption = useCallback(
    (key: 'caseSensitive' | 'wholeWord' | 'isRegex') => {
      setSearchOptions((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        if (searchQuery.trim() && searchResults) {
          void runSearch(searchQuery, next);
        }
        return next;
      });
    },
    [searchQuery, searchResults, runSearch]
  );

  const clearSearch = useCallback(() => {
    searchRequestRef.current += 1;
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
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
    searchQuery,
    setSearchQuery,
    searchOptions,
    setSearchOptions,
    searchResults,
    isSearching,
    copyStatus,
    loadPackageByPath,
    selectChapter,
    clearView,
    updateScroll,
    toggleCompleted,
    runSearch,
    toggleSearchOption,
    clearSearch,
    copyCodeToClipboard
  };
}
