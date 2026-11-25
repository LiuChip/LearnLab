import { contextBridge, ipcRenderer } from 'electron';
import type {
  LoadedPackage,
  LoadError,
  ReadingProgressRecord,
  ChapterProgressUpdate,
  ExperimentAttemptDetail,
  SearchOptions,
  SearchResult,
  ChapterNavigationItem,
  ConfigStoreError,
  SettingsTransferError
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
  PluginResolution,
  ExecutionPlan,
  ExecutionPlanError,
  ExperimentCloseResult,
  PluginPermissionDecision,
  PluginPermissionRequest,
  ExecutionOutputEvent,
  ExecutionCompleteEvent
} from '@learnlab/core-types';

type ReadChapterPayload = { content: string; contentHash: string };

const api = {
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
    importPackage: (
      workspaceDir: string
    ): Promise<{ canceled: true } | { canceled: false; result: RegisterPackageResult }> =>
      ipcRenderer.invoke('workspace:import-package', workspaceDir),
    isExampleAvailable: (): Promise<boolean> => ipcRenderer.invoke('workspace:example-available'),
    importExample: (workspaceDir: string): Promise<RegisterPackageResult> =>
      ipcRenderer.invoke('workspace:import-example', workspaceDir),
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
      ipcRenderer.invoke('database:get-experiment-attempts', packageDir, labId),
    getWorkspaceSetting: (workspaceDir: string, key: string): Promise<string | null> =>
      ipcRenderer.invoke('database:get-workspace-setting', workspaceDir, key),
    setWorkspaceSetting: (workspaceDir: string, key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('database:set-workspace-setting', workspaceDir, key, value)
  },
  config: {
    read: (): Promise<Result<AppConfig, ConfigStoreError>> => ipcRenderer.invoke('config:read'),
    write: (config: AppConfig): Promise<Result<void, ConfigStoreError>> => ipcRenderer.invoke('config:write', config),
    exportJson: (config: AppConfig): Promise<string> => ipcRenderer.invoke('config:export-json', config),
    importJson: (rawJson: string, currentConfig: AppConfig): Promise<Result<AppConfig, SettingsTransferError>> => ipcRenderer.invoke('config:import-json', rawJson, currentConfig),
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
  },
  execution: {
    start: (plan: ExecutionPlan): Promise<Result<{ executionId: string }, ExecutionPlanError>> =>
      ipcRenderer.invoke('execution:start', plan),
    cancel: (executionId: string): Promise<void> =>
      ipcRenderer.invoke('execution:cancel', executionId),
    isRunning: (executionId: string): Promise<boolean> =>
      ipcRenderer.invoke('execution:is-running', executionId),
    confirmClose: (packageDir: string, labId?: string): Promise<ExperimentCloseResult> =>
      ipcRenderer.invoke('execution:confirm-close', packageDir, labId),
    respondToPermissionRequest: (requestId: string, decision: PluginPermissionDecision): Promise<boolean> =>
      ipcRenderer.invoke('execution:respond-permission', requestId, decision),
    onPermissionRequest: (callback: (request: PluginPermissionRequest) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: PluginPermissionRequest) => callback(request);
      ipcRenderer.on('execution:permission-request', listener);
      return () => ipcRenderer.removeListener('execution:permission-request', listener);
    },
    onPermissionRequestClosed: (callback: (requestId: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, requestId: string) => callback(requestId);
      ipcRenderer.on('execution:permission-closed', listener);
      return () => ipcRenderer.removeListener('execution:permission-closed', listener);
    },
    onOutput: (callback: (event: Electron.IpcRendererEvent, data: ExecutionOutputEvent) => void) => {
      ipcRenderer.on('execution:output', callback as Parameters<typeof ipcRenderer.on>[1]);
      return () => ipcRenderer.removeListener('execution:output', callback as Parameters<typeof ipcRenderer.on>[1]);
    },
    onComplete: (callback: (event: Electron.IpcRendererEvent, data: ExecutionCompleteEvent) => void) => {
      ipcRenderer.on('execution:complete', callback as Parameters<typeof ipcRenderer.on>[1]);
      return () => ipcRenderer.removeListener('execution:complete', callback as Parameters<typeof ipcRenderer.on>[1]);
    }
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('learnlab', api);
} else {
  window.learnlab = api;
}
