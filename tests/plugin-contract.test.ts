import { describe, expect, it } from 'vitest';
import type { AppContext, WorkspaceContext, PackageContext } from '@learnlab/core-types';

// Exported to avoid unused variable warnings while providing compile-time type assertions.
// The function body is never executed during runtime tests.
export function _compileTimeAssertions(
  appContext: AppContext,
  workspaceContext: WorkspaceContext,
  packageContext: PackageContext
) {
  // @ts-expect-error: AppContext fields are readonly and cannot be mutated
  appContext.version = '2.0.0';

  // @ts-expect-error: WorkspaceContext fields are readonly and cannot be mutated
  workspaceContext.workspaceId = 'ws-456';
  // @ts-expect-error: WorkspaceContext fields are readonly and cannot be mutated
  workspaceContext.name = 'Other Workspace';

  // @ts-expect-error: PackageContext fields are readonly and cannot be mutated
  packageContext.packageId = 'org.other.pkg';
}

describe('plugin-contract', () => {
  it('defines AppContext as readonly', () => {
    const context: AppContext = {
      version: '1.0.0'
    };
    expect(context.version).toBe('1.0.0');
  });

  it('defines WorkspaceContext as readonly', () => {
    const context: WorkspaceContext = {
      workspaceId: 'ws-123',
      name: 'Test Workspace'
    };
    expect(context.workspaceId).toBe('ws-123');
    expect(context.name).toBe('Test Workspace');
  });

  it('defines PackageContext as readonly', () => {
    const context: PackageContext = {
      packageId: 'org.example.pkg'
    };
    expect(context.packageId).toBe('org.example.pkg');
  });
});
