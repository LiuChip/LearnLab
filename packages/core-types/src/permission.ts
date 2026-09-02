export type PermissionScope = 'read' | 'write' | 'execute';

export interface Permission {
  scope: PermissionScope;
  resource: string;
}
