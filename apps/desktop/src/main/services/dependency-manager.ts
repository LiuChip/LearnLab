import { WorkspaceManager } from '@learnlab/core';
import type {
  ImportDependencyResult,
  RegisteredPackage,
  RegisterPackageResult,
  WorkspaceDependencyRecord,
  WorkspacePaths
} from '@learnlab/core-types';

export class DesktopDependencyManager {
  static async initWorkspace(workspaceDir: string): Promise<WorkspacePaths> {
    return WorkspaceManager.initWorkspace(workspaceDir);
  }

  static async registerPackage(
    workspaceDir: string,
    packageDir: string
  ): Promise<RegisterPackageResult> {
    return WorkspaceManager.registerPackage(workspaceDir, packageDir);
  }

  static async listPackages(workspaceDir: string): Promise<RegisteredPackage[]> {
    return WorkspaceManager.listPackages(workspaceDir);
  }

  static async importBundledDependency(
    workspaceDir: string,
    packageId: string,
    dependencyId: string
  ): Promise<ImportDependencyResult> {
    return WorkspaceManager.importBundledDependency(workspaceDir, packageId, dependencyId);
  }

  static async getDependencies(workspaceDir: string): Promise<WorkspaceDependencyRecord[]> {
    return WorkspaceManager.getWorkspaceDependencies(workspaceDir);
  }
}
