import type { PluginPermissions } from '@learnlab/core-types';

export interface PermissionResolutionInput {
  declared: PluginPermissions;
  grantedByUser: PluginPermissions;
  requestedByPackage?: PluginPermissions;
  hostCapabilities: PluginPermissions;
}

export interface ResolvedPermissions {
  readonly read: ReadonlySet<string>;
  readonly write: ReadonlySet<string>;
  readonly execute: ReadonlySet<string>;
}

export function resolvePermissions(input: PermissionResolutionInput): ResolvedPermissions {
  const resolved = {
    read: new Set<string>(),
    write: new Set<string>(),
    execute: new Set<string>()
  };

  const scopes = ['read', 'write', 'execute'] as const;

  for (const scope of scopes) {
    const declared = input.declared[scope] || [];
    const granted = new Set(input.grantedByUser[scope] || []);
    const host = new Set(input.hostCapabilities[scope] || []);
    const packageReq = new Set(input.requestedByPackage?.[scope] || []);

    for (const resource of declared) {
      if (granted.has(resource) && host.has(resource) && packageReq.has(resource)) {
        resolved[scope].add(resource);
      }
    }
  }

  return resolved;
}
