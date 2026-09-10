export type PermissionScope = 'read' | 'write' | 'execute';

export type ReadResource = string;

export type WriteResource = string;

export type ExecuteResource = string;

export interface Permission {
  scope: PermissionScope;
  resource: string;
}

export interface PluginPermissions {
  read?: string[];
  write?: string[];
  execute?: string[];
}
