import { ipcMain } from 'electron';
import { WorkspaceManager } from '@learnlab/core';
import {
  assertTrustedRenderer,
  assertTrustedWorkspace,
  rememberPackage,
  rememberWorkspace,
  requireIdentifier,
  requireNonEmptyString
} from './security';

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:init', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    const normalizedWorkspace = requireNonEmptyString(workspaceDir, 'workspaceDir');
    const paths = await WorkspaceManager.initWorkspace(normalizedWorkspace);
    rememberWorkspace(paths.workspaceDir);
    return paths;
  });

  ipcMain.handle(
    'workspace:register-package',
    async (event, workspaceDir: string, packageDir: string) => {
      assertTrustedRenderer(event);
      const normalizedWorkspace = assertTrustedWorkspace(workspaceDir);
      const normalizedPackage = requireNonEmptyString(packageDir, 'packageDir');
      const result = await WorkspaceManager.registerPackage(normalizedWorkspace, normalizedPackage);
      if (result.ok) rememberPackage(result.value.path);
      return result;
    }
  );

  ipcMain.handle(
    'workspace:unregister-package',
    async (event, workspaceDir: string, packageId: string) => {
      assertTrustedRenderer(event);
      return WorkspaceManager.unregisterPackage(
        assertTrustedWorkspace(workspaceDir),
        requireIdentifier(packageId, 'packageId')
      );
    }
  );

  ipcMain.handle('workspace:list-packages', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    return WorkspaceManager.listPackages(assertTrustedWorkspace(workspaceDir));
  });

  ipcMain.handle(
    'workspace:get-package',
    async (event, workspaceDir: string, packageId: string) => {
      assertTrustedRenderer(event);
      return WorkspaceManager.getPackage(
        assertTrustedWorkspace(workspaceDir),
        requireIdentifier(packageId, 'packageId')
      );
    }
  );
}
