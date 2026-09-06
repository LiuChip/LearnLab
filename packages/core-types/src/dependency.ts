import type { Result } from './validator';
import type { DependencyMetadata } from './adapter';

export interface DependencyImportOptions {
  workspaceDir: string;
  archivePath: string;
  metadata: DependencyMetadata;
  packageDir?: string;
}

export interface DependencyImportError {
  type:
    | 'file_not_found'
    | 'size_mismatch'
    | 'hash_mismatch'
    | 'path_traversal'
    | 'symlink_escape'
    | 'unsupported_archive'
    | 'extraction_failed'
    | 'io_error';
  message: string;
  details?: unknown;
}

export interface DependencyImportResult {
  installPath: string;
  fingerprint: string;
  reused: boolean;
  extractedFiles: string[];
}

export type ImportDependencyResult = Result<DependencyImportResult, DependencyImportError>;
