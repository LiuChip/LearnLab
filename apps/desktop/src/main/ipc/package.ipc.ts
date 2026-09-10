import { ipcMain } from 'electron';
import {
  buildChapterNavigationList,
  loadPackage,
  loadPackageManifest,
  searchPackage,
  searchWorkspace,
  WorkspaceManager,
  type SearchOptions
} from '@learnlab/core';
import { DesktopDatabaseService } from '../services/database';
import {
  assertTrustedPackage,
  assertTrustedRenderer,
  assertTrustedWorkspace
} from './security';

function validateSearchOptions(value: unknown): SearchOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Search options must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.query !== 'string') {
    throw new TypeError('Search query must be a string');
  }
  return {
    query: raw.query,
    caseSensitive: Boolean(raw.caseSensitive),
    wholeWord: Boolean(raw.wholeWord),
    isRegex: Boolean(raw.isRegex)
  };
}

export function registerPackageIpc(): void {
  ipcMain.handle(
    'package:search',
    async (event, packageDir: string, rawOptions: unknown) => {
      assertTrustedRenderer(event);
      const trustedDir = assertTrustedPackage(event.sender, packageDir);
      const options = validateSearchOptions(rawOptions);
      const loaded = await loadPackageManifest(trustedDir);
      if (!loaded.ok) {
        return {
          matches: [],
          totalMatches: 0,
          searchedChapters: 0,
          searchedPackages: 0,
          skippedChapters: 0,
          skippedPackages: 0,
          warnings: [],
          error: loaded.error.message
        };
      }
      return searchPackage(trustedDir, loaded.value, options);
    }
  );

  ipcMain.handle(
    'package:search-workspace',
    async (event, workspaceDir: string, rawOptions: unknown) => {
      assertTrustedRenderer(event);
      const trustedWorkspace = assertTrustedWorkspace(event.sender, workspaceDir);
      const options = validateSearchOptions(rawOptions);
      const packages = await WorkspaceManager.listPackages(trustedWorkspace);
      return searchWorkspace(packages, options);
    }
  );

  ipcMain.handle(
    'package:list-chapters',
    async (event, packageDir: string) => {
      assertTrustedRenderer(event);
      const trustedDir = assertTrustedPackage(event.sender, packageDir);
      const loaded = await loadPackage(trustedDir);
      if (!loaded.ok) {
        throw new Error(loaded.error.message);
      }
      const db = DesktopDatabaseService.getPackageDb(trustedDir);
      const progress = db.getAllReadingProgress();
      return buildChapterNavigationList(loaded.value.manifest, progress);
    }
  );
}
