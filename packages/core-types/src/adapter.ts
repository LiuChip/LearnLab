export interface DependencyMetadata {
  id: string;
  version: string;
  platform: string;
  arch: string;
  archive: {
    file: string;
    sha256: string;
    size: number;
  };
}

export function dependencyFingerprint(metadata: DependencyMetadata): string {
  return [metadata.id, metadata.version, metadata.platform, metadata.arch, metadata.archive.sha256.toLowerCase()].join('@');
}
