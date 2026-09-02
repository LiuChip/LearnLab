import { contextBridge, ipcRenderer } from 'electron';
import type { LoadedPackage, LoadError } from '@learnlab/core';
import type { Result } from '@learnlab/core-types';

const api = {
  getExamplePackageDir: (): Promise<string> => ipcRenderer.invoke('package:example-dir'),
  loadPackage: (packageDir: string): Promise<Result<LoadedPackage, LoadError>> => ipcRenderer.invoke('package:load', packageDir),
  readChapter: (packageDir: string, chapterFile: string): Promise<Result<string, LoadError>> => ipcRenderer.invoke('package:read-chapter', packageDir, chapterFile)
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('learnlab', api);
} else {
  window.learnlab = api;
}
