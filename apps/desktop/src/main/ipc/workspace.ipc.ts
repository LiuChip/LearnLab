import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { importPackageIntoWorkspace, WorkspaceManager } from '@learnlab/core';
import type { RegisterPackageResult } from '@learnlab/core-types';
import { getDefaultWorkspaceDir } from '../services/paths';
import {
  assertTrustedRenderer,
  assertTrustedWorkspace,
  rememberPackage,
  rememberWorkspace,
  requireIdentifier,
  requireNonEmptyString
} from './security';

// Development fixture only; packaged builds simply report it as unavailable.
function exampleSourceDir(): string {
  return join(app.getAppPath(), '../../examples/packages/sql-intro');
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:default-dir', async (event) => {
    assertTrustedRenderer(event);
    return getDefaultWorkspaceDir();
  });

  ipcMain.handle('workspace:init', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    const normalizedWorkspace = requireNonEmptyString(workspaceDir, 'workspaceDir');
    const paths = await WorkspaceManager.initWorkspace(normalizedWorkspace);
    rememberWorkspace(event.sender, paths.workspaceDir);
    return paths;
  });

  ipcMain.handle(
    'workspace:register-package',
    async (event, workspaceDir: string, packageDir: string) => {
      assertTrustedRenderer(event);
      const normalizedWorkspace = assertTrustedWorkspace(event.sender, workspaceDir);
      const normalizedPackage = requireNonEmptyString(packageDir, 'packageDir');
      const result = await WorkspaceManager.registerPackage(normalizedWorkspace, normalizedPackage);
      if (result.ok) rememberPackage(event.sender, result.value.path);
      return result;
    }
  );

  // The renderer never supplies the source path: the main process asks the user
  // through the system dialog, so a compromised page cannot read arbitrary folders.
  ipcMain.handle('workspace:import-package', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    const normalizedWorkspace = assertTrustedWorkspace(event.sender, workspaceDir);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const picked = await (owner
      ? dialog.showOpenDialog(owner, {
          title: '选择要导入的实验包目录',
          buttonLabel: '导入',
          properties: ['openDirectory']
        })
      : dialog.showOpenDialog({ title: '选择要导入的实验包目录', properties: ['openDirectory'] }));
    if (picked.canceled || picked.filePaths.length === 0) return { canceled: true as const };
    const result = await importPackageIntoWorkspace(normalizedWorkspace, picked.filePaths[0]);
    if (result.ok) rememberPackage(event.sender, result.value.path);
    return { canceled: false as const, result };
  });

  ipcMain.handle('workspace:example-available', (event) => {
    assertTrustedRenderer(event);
    return existsSync(exampleSourceDir());
  });

  ipcMain.handle('workspace:import-example', async (event, workspaceDir: string): Promise<RegisterPackageResult> => {
    assertTrustedRenderer(event);
    const normalizedWorkspace = assertTrustedWorkspace(event.sender, workspaceDir);
    const source = exampleSourceDir();
    if (!existsSync(source)) {
      return { ok: false, error: { type: 'package_not_found', message: '当前构建不包含示例实验包。' } };
    }
    const result = await importPackageIntoWorkspace(normalizedWorkspace, source);
    if (result.ok) rememberPackage(event.sender, result.value.path);
    return result;
  });

  ipcMain.handle(
    'workspace:unregister-package',
    async (event, workspaceDir: string, packageId: string) => {
      assertTrustedRenderer(event);
      return WorkspaceManager.unregisterPackage(
        assertTrustedWorkspace(event.sender, workspaceDir),
        requireIdentifier(packageId, 'packageId')
      );
    }
  );

  ipcMain.handle('workspace:list-packages', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    return WorkspaceManager.listPackages(assertTrustedWorkspace(event.sender, workspaceDir));
  });

  ipcMain.handle(
    'workspace:get-package',
    async (event, workspaceDir: string, packageId: string) => {
      assertTrustedRenderer(event);
      return WorkspaceManager.getPackage(
        assertTrustedWorkspace(event.sender, workspaceDir),
        requireIdentifier(packageId, 'packageId')
      );
    }
  );
}
