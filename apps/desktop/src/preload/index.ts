import { contextBridge, ipcRenderer } from 'electron';
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
  WorkspaceDependencyRecord,
  WorkspacePaths,
  WorkspacePrerequisiteRecord,
  AppConfig,
  Result,
  PluginManifest,
  PluginResolution
} from '@learnlab/core-types';

type ReadChapterPayload = { content: string; contentHash: string };

const api = {
  getExamplePackageDir: (): Promise<string> => ipcRenderer.invoke('package:example-dir'),
  loadPackage: (packageDir: string): Promise<Result<LoadedPackage, LoadError>> =>
    ipcRenderer.invoke('package:load', packageDir),
  readChapter: (packageDir: string, chapterFile: string): Promise<Result<ReadChapterPayload, LoadError>> =>
    ipcRenderer.invoke('package:read-chapter', packageDir, chapterFile),
  package: {
    search: (packageDir: string, options: SearchOptions): Promise<SearchResult> =>
      ipcRenderer.invoke('package:search', packageDir, options),
    searchWorkspace: (workspaceDir: string, options: SearchOptions): Promise<SearchResult> =>
      ipcRenderer.invoke('package:search-workspace', workspaceDir, options),
    listChapters: (packageDir: string): Promise<ChapterNavigationItem[]> =>
      ipcRenderer.invoke('package:list-chapters', packageDir)
  },
  workspace: {
    getDefaultDir: (): Promise<string> => ipcRenderer.invoke('workspace:default-dir'),
    init: (workspaceDir: string): Promise<WorkspacePaths> =>
      ipcRenderer.invoke('workspace:init', workspaceDir),
    registerPackage: (workspaceDir: string, packageDir: string): Promise<RegisterPackageResult> =>
      ipcRenderer.invoke('workspace:register-package', workspaceDir, packageDir),
    unregisterPackage: (workspaceDir: string, packageId: string): Promise<boolean> =>
      ipcRenderer.invoke('workspace:unregister-package', workspaceDir, packageId),
    listPackages: (workspaceDir: string): Promise<RegisteredPackage[]> =>
      ipcRenderer.invoke('workspace:list-packages', workspaceDir),
    getPackage: (workspaceDir: string, packageId: string): Promise<RegisteredPackage | undefined> =>
      ipcRenderer.invoke('workspace:get-package', workspaceDir, packageId)
  },
  database: {
    getReadingProgress: (packageDir: string, chapterId: string): Promise<ReadingProgressRecord | undefined> =>
      ipcRenderer.invoke('database:get-reading-progress', packageDir, chapterId),
    saveReadingProgress: (packageDir: string, chapterId: string, contentHash: string, update?: ChapterProgressUpdate): Promise<ReadingProgressRecord> =>
      ipcRenderer.invoke('database:save-reading-progress', packageDir, chapterId, contentHash, update),
    getAllProgress: (packageDir: string): Promise<ReadingProgressRecord[]> =>
      ipcRenderer.invoke('database:get-all-progress', packageDir),
    recordExperimentAttempt: (packageDir: string, attempt: ExperimentAttemptDetail): Promise<string> =>
      ipcRenderer.invoke('database:record-experiment-attempt', packageDir, attempt),
    getExperimentAttempts: (packageDir: string, labId: string): Promise<ExperimentAttemptDetail[]> =>
      ipcRenderer.invoke('database:get-experiment-attempts', packageDir, labId)
  },
  config: {
    read: () => ipcRenderer.invoke('config:read') as Promise<Result<AppConfig, { type: string; message: string }>>,
    write: (config: AppConfig) => ipcRenderer.invoke('config:write', config),
    exportJson: (config: AppConfig) => ipcRenderer.invoke('config:export-json', config),
    importJson: (rawJson: string, currentConfig: AppConfig) => ipcRenderer.invoke('config:import-json', rawJson, currentConfig),
    backupInstructions: () => ipcRenderer.invoke('config:backup-instructions') as Promise<string>
  },
  dependencies: {
    importBundled: (
      workspaceDir: string,
      packageId: string,
      dependencyId: string
    ): Promise<ImportDependencyResult> =>
      ipcRenderer.invoke('dependency:import-bundled', workspaceDir, packageId, dependencyId),
    list: (workspaceDir: string): Promise<WorkspaceDependencyRecord[]> =>
      ipcRenderer.invoke('dependency:list', workspaceDir),
    prerequisites: (workspaceDir: string): Promise<WorkspacePrerequisiteRecord[]> =>
      ipcRenderer.invoke('dependency:prerequisites', workspaceDir)
  },
  plugins: {
    list: (): Promise<PluginManifest[]> => ipcRenderer.invoke('plugin:list'),
    resolveForPackage: (packageDir: string): Promise<PluginResolution> =>
      ipcRenderer.invoke('plugin:resolve-for-package', packageDir)
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('learnlab', api);
} else {
  window.learnlab = api;
}
