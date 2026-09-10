import type {
  LoadedPackage,
  LoadError,
  ReadingProgressRecord,
  ChapterProgressUpdate,
  ExperimentAttemptDetail,
  SearchOptions,
  SearchResult,
  ChapterNavigationItem
} from '@learnlab/core';
import type {
  ImportDependencyResult,
  RegisterPackageResult,
  RegisteredPackage,
  Result,
  WorkspaceDependencyRecord,
  WorkspacePaths,
  WorkspacePrerequisiteRecord,
  AppConfig,
  PluginManifest,
  PluginResolution
} from '@learnlab/core-types';

type ReadChapterPayload = { content: string; contentHash: string };

export interface LearnLabAPI {
  getExamplePackageDir: () => Promise<string>;
  loadPackage: (packageDir: string) => Promise<Result<LoadedPackage, LoadError>>;
  readChapter: (packageDir: string, chapterFile: string) => Promise<Result<ReadChapterPayload, LoadError>>;
  package: {
    search: (packageDir: string, options: SearchOptions) => Promise<SearchResult>;
    searchWorkspace: (workspaceDir: string, options: SearchOptions) => Promise<SearchResult>;
    listChapters: (packageDir: string) => Promise<ChapterNavigationItem[]>;
  };
  workspace: {
    getDefaultDir: () => Promise<string>;
    init: (workspaceDir: string) => Promise<WorkspacePaths>;
    registerPackage: (workspaceDir: string, packageDir: string) => Promise<RegisterPackageResult>;
    unregisterPackage: (workspaceDir: string, packageId: string) => Promise<boolean>;
    listPackages: (workspaceDir: string) => Promise<RegisteredPackage[]>;
    getPackage: (workspaceDir: string, packageId: string) => Promise<RegisteredPackage | undefined>;
  };
  database: {
    getReadingProgress: (packageDir: string, chapterId: string) => Promise<ReadingProgressRecord | undefined>;
    saveReadingProgress: (packageDir: string, chapterId: string, contentHash: string, update?: ChapterProgressUpdate) => Promise<ReadingProgressRecord>;
    getAllProgress: (packageDir: string) => Promise<ReadingProgressRecord[]>;
    recordExperimentAttempt: (packageDir: string, attempt: ExperimentAttemptDetail) => Promise<string>;
    getExperimentAttempts: (packageDir: string, labId: string) => Promise<ExperimentAttemptDetail[]>;
  };
  config: {
    read: () => Promise<unknown>;
    write: (config: AppConfig) => Promise<unknown>;
    exportJson: (config: AppConfig) => Promise<string>;
    importJson: (rawJson: string, currentConfig: AppConfig) => Promise<unknown>;
    backupInstructions: () => Promise<string>;
  };
  dependencies: {
    importBundled: (
      workspaceDir: string,
      packageId: string,
      dependencyId: string
    ) => Promise<ImportDependencyResult>;
    list: (workspaceDir: string) => Promise<WorkspaceDependencyRecord[]>;
    prerequisites: (workspaceDir: string) => Promise<WorkspacePrerequisiteRecord[]>;
  };
  plugins: {
    list: () => Promise<PluginManifest[]>;
    resolveForPackage: (packageDir: string) => Promise<PluginResolution>;
  };
}

declare global {
  interface Window {
    learnlab: LearnLabAPI;
  }
}
