import * as path from 'node:path';
import type { DependencyMetadata } from '@learnlab/core-types';

function safeSegment(value: string, label: string): string {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`Invalid dependency ${label}`);
  }
  return value;
}

export function getDependencyInstallPath(workspaceDir: string, metadata: DependencyMetadata): string {
  const id = safeSegment(metadata.id, 'id');
  const version = safeSegment(metadata.version, 'version');
  const platform = safeSegment(metadata.platform, 'platform');
  const arch = safeSegment(metadata.arch, 'arch');
  const sha256 = safeSegment(metadata.archive.sha256.toLowerCase(), 'sha256');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid dependency sha256');
  return path.join(path.resolve(workspaceDir), 'dependencies', id, version, `${platform}-${arch}`, sha256);
}
