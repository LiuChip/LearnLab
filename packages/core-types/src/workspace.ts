import type { Result } from './validator';

export interface WorkspacePaths {
  workspaceDir: string;
  dependenciesDir: string;
}

export interface RegisteredPackage {
  id: string;
  name: string;
  version: string;
  path: string;
  isSymlink: boolean;
  targetPath?: string;
  registeredAt: string;
}

export interface PackageRegisterError {
  type:
    | 'package_not_found'
    | 'manifest_invalid'
    | 'package_already_registered'
    | 'name_conflict'
    | 'path_conflict'
    | 'read_error';
  message: string;
  conflictPath?: string;
  details?: unknown;
}

export type RegisterPackageResult = Result<RegisteredPackage, PackageRegisterError>;

export interface WorkspaceDependencyRecord {
  dependencyId: string;
  version: string;
  platform: string;
  arch: string;
  sha256: string;
  path: string;
  sourceType: 'repository' | 'bundled';
  sourcePackageId?: string;
  status: 'installed' | 'missing' | 'failed';
  installedAt?: string;
}

export interface PackageDependencyLink {
  packageId: string;
  dependencyId: string;
  requiredVersion: string;
  resolvedVersion?: string;
  resolvedSha256?: string;
  sourceType: 'repository' | 'bundled' | 'either';
  status: 'ready' | 'missing' | 'failed';
}

export interface WorkspacePrerequisiteRecord {
  packageId: string;
  prerequisiteId: string;
  version: string;
  required: boolean;
  reason?: string;
  detect?: 'plugin' | 'manual';
}

export interface WorkspaceState {
  version: number;
  packages: Record<string, RegisteredPackage>;
  dependencies: Record<string, WorkspaceDependencyRecord>;
  dependencyLinks: PackageDependencyLink[];
  prerequisites: WorkspacePrerequisiteRecord[];
}
