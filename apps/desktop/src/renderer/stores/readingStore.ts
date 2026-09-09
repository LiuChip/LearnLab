import { useState, useCallback, useRef } from 'preact/hooks';
import { parseMarkdown, type MarkdownResult } from '@learnlab/markdown';
import {
  calculateScrollProgress,
  evaluatePluginReadonlyStatus,
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
  activePackageDirRef.current = packageDir;

  const refreshChapters = useCallback(async (pkgDir: string) => {
    try {
      const list = await window.learnlab.package.listChapters(pkgDir);
      setChapters(list);
    } catch {
      // If listChapters fails, fallback to loaded package manifest
    }
  }, []);

  const loadPackageByPath = useCallback(
    async (dir: string, preferredChapterId?: string) => {
      setIsLoading(true);
      setError(null);
      setPackageDir(dir);

      try {
        const loaded = await window.learnlab.loadPackage(dir);
        if (!loaded.ok) {
          setError({ type: loaded.error.type, message: loaded.error.message });
          setIsLoading(false);
          return;
        }

        const manifest = loaded.value.manifest;
        setPackageName(manifest.name);

        // Evaluate plugin requirements
        const pluginStatus = evaluatePluginReadonlyStatus(manifest.required_plugins, []);
        setReadonlyStatus(pluginStatus);

        // Refresh chapter navigation list
        const chapterList = await window.learnlab.package.listChapters(dir);
        setChapters(chapterList);

        if (chapterList.length === 0) {
          setActiveChapterId(null);
          setMarkdown(null);
          setIsLoading(false);
          return;
        }

        const targetChapter =
          chapterList.find((c) => c.id === preferredChapterId) ?? chapterList[0];
        setActiveChapterId(targetChapter.id);

        // Read target chapter
        const readResult = await window.learnlab.readChapter(dir, targetChapter.file);
        if (!readResult.ok) {
          setError({ type: readResult.error.type, message: readResult.error.message });
          setIsLoading(false);
          return;
        }

        const hash = (readResult as { contentHash?: string }).contentHash || '';
        setContentHash(hash);

        // Sync with database for fingerprint invalidation
        await window.learnlab.database.saveReadingProgress(dir, targetChapter.id, hash);

        const parsed = await parseMarkdown(readResult.value);
        setMarkdown(parsed);

        // Refresh list to reflect any fingerprint reset
        const updatedList = await window.learnlab.package.listChapters(dir);
        setChapters(updatedList);
      } catch (cause) {
        setError({
          type: 'read_error',
          message: cause instanceof Error ? cause.message : String(cause)
        });
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const selectChapter = useCallback(
    async (chapterId: string) => {
      const currentDir = activePackageDirRef.current;
      if (!currentDir) return;

      const target = chapters.find((c) => c.id === chapterId);
      if (!target) return;

      setIsLoading(true);
      setError(null);
      setActiveChapterId(chapterId);

      try {
        const readResult = await window.learnlab.readChapter(currentDir, target.file);
        if (!readResult.ok) {
          setError({ type: readResult.error.type, message: readResult.error.message });
          setIsLoading(false);
          return;
        }

        const hash = (readResult as { contentHash?: string }).contentHash || '';
        setContentHash(hash);

        await window.learnlab.database.saveReadingProgress(currentDir, target.id, hash);
        const parsed = await parseMarkdown(readResult.value);
        setMarkdown(parsed);

        await refreshChapters(currentDir);
      } catch (cause) {
        setError({
          type: 'read_error',
          message: cause instanceof Error ? cause.message : String(cause)
        });
      } finally {
        setIsLoading(false);
      }
    },
    [chapters, refreshChapters]
  );

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
      if (!currentDir || !activeChapterId || !contentHash) return;

      const calc = calculateScrollProgress(scrollTop, scrollHeight, clientHeight);
      if (calc.isAtBottom || Math.abs((activeChapter?.progressPercent ?? 0) - calc.progressPercent) >= 5) {
        await window.learnlab.database.saveReadingProgress(currentDir, activeChapterId, contentHash, {
          scrollY: calc.scrollY,
          progressPercent: calc.progressPercent,
          completed: calc.isAtBottom
        });
        await refreshChapters(currentDir);
      }
    },
    [activeChapterId, contentHash, activeChapter, refreshChapters]
  );

  const toggleCompleted = useCallback(
    async (completed: boolean) => {
      const currentDir = activePackageDirRef.current;
      if (!currentDir || !activeChapterId || !contentHash) return;

      await window.learnlab.database.saveReadingProgress(currentDir, activeChapterId, contentHash, {
        completed,
        progressPercent: completed ? 100 : 0,
        scrollY: completed ? (activeChapter?.progressPercent ?? 100) : 0
      });
      await refreshChapters(currentDir);
    },
    [activeChapterId, contentHash, activeChapter, refreshChapters]
  );

  const runSearch = useCallback(
    async (queryText: string, opts?: Partial<SearchOptions>) => {
      const currentDir = activePackageDirRef.current;
      if (!currentDir) return;

      const mergedOpts: SearchOptions = {
        query: queryText,
        caseSensitive: opts?.caseSensitive ?? searchOptions.caseSensitive,
        wholeWord: opts?.wholeWord ?? searchOptions.wholeWord,
        isRegex: opts?.isRegex ?? searchOptions.isRegex
      };

      setIsSearching(true);
      try {
        const result = await window.learnlab.package.search(currentDir, mergedOpts);
        setSearchResults(result);
      } catch (err) {
        setSearchResults({
          matches: [],
          totalMatches: 0,
          searchedChapters: 0,
          searchedPackages: 0,
          error: err instanceof Error ? err.message : String(err)
        });
      } finally {
        setIsSearching(false);
      }
    },
    [searchOptions]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
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
    searchQuery,
    setSearchQuery,
    searchOptions,
    setSearchOptions,
    searchResults,
    isSearching,
    copyStatus,
    loadPackageByPath,
    selectChapter,
    updateScroll,
    toggleCompleted,
    runSearch,
    clearSearch,
    copyCodeToClipboard
  };
}
