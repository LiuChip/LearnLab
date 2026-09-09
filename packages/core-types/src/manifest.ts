export type DependencySource = 'repository' | 'bundled' | 'either';

export interface PluginRequirement {
  id: string;
  version: string;
}

export interface RuntimeDependency {
  id: string;
  version: string;
  provider: string;
  source?: DependencySource;
  bundled_artifact?: {
    path: string;
    sha256: string;
    size: number;
  };
}

export interface ExternalPrerequisite {
  id: string;
  version: string;
  required: boolean;
  reason?: string;
  detect?: 'plugin' | 'manual';
}

export interface ChapterEntry {
  id: string;
  title: string;
  file: string;
  experiment_count?: number;
}

export interface PackageManifest {
  id: string;
  version: string;
  name: string;
  author: string;
  description?: string;
  license?: string;
  experiment_count?: number;
  chapters: ChapterEntry[];
  required_plugins?: PluginRequirement[];
  runtime_dependencies?: RuntimeDependency[];
  external_prerequisites?: ExternalPrerequisite[];
}
