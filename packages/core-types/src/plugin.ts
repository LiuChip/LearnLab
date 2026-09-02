import type { PluginRequirement } from './manifest';

export type PluginStatus =
  | 'installed'
  | 'active-global'
  | 'active-package'
  | 'missing'
  | 'disabled'
  | 'incompatible'
  | 'blocked'
  | 'read-only';

export type ActivationMode = 'global' | 'package';

export interface PluginManifest {
  plugin_id: string;
  version: string;
  author?: string;
  signature?: string;
  api_version?: number;
  activation?: { mode: ActivationMode };
  provides?: string[];
  requires_plugins?: PluginRequirement[];
  permissions?: {
    read?: string[];
    write?: string[];
    execute?: string[];
  };
  breaking_change?: boolean;
}

export interface PluginResolutionInput {
  installedPlugins: PluginManifest[];
  packageRequirements?: PluginRequirement[];
  disabledPluginIds?: Iterable<string>;
}

export interface PluginResolutionIssue {
  requirement: PluginRequirement;
  availableVersions?: string[];
  reason: 'missing' | 'incompatible' | 'disabled';
}

export interface PluginResolution {
  loadOrder: string[];
  active: PluginManifest[];
  issues: PluginResolutionIssue[];
  cycles: string[][];
  readOnly: boolean;
}
