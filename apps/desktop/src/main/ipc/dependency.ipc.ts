import { ipcMain } from 'electron';
import { WorkspaceManager } from '@learnlab/core';
import { assertTrustedRenderer, assertTrustedWorkspace, requireIdentifier } from './security';

export function registerDependencyIpc(): void {
  ipcMain.handle(
    'dependency:import-bundled',
    async (event, workspaceDir: string, packageId: string, dependencyId: string) => {
      assertTrustedRenderer(event);
      return WorkspaceManager.importBundledDependency(
        assertTrustedWorkspace(event.sender, workspaceDir),
        requireIdentifier(packageId, 'packageId'),
        requireIdentifier(dependencyId, 'dependencyId')
      );
    }
  );

  ipcMain.handle('dependency:list', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    return WorkspaceManager.getWorkspaceDependencies(assertTrustedWorkspace(event.sender, workspaceDir));
  });

  ipcMain.handle('dependency:prerequisites', async (event, workspaceDir: string) => {
    assertTrustedRenderer(event);
    return WorkspaceManager.getWorkspacePrerequisites(assertTrustedWorkspace(event.sender, workspaceDir));
  });
}
