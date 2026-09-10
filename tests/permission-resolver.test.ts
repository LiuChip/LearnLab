import { describe, expect, it } from 'vitest';
import { resolvePermissions } from '../packages/core/src/permission-resolver';
import type { PluginPermissions } from '@learnlab/core-types';

describe('permission-resolver', () => {
  it('intersects declared, granted, and host capabilities correctly', () => {
    const declared: PluginPermissions = {
      read: ['package.current', 'app.version', 'package.dependencies'],
      write: ['plugin.settings', 'package.dynamic_files'],
      execute: ['network.request']
    };

    const grantedByUser: PluginPermissions = {
      read: ['package.current', 'app.version', 'package.dependencies'],
      write: ['plugin.settings'], // user denied package.dynamic_files
      execute: ['network.request']
    };

    const hostCapabilities: PluginPermissions = {
      read: ['package.current', 'app.version', 'package.dependencies'],
      write: ['plugin.settings', 'package.dynamic_files'],
      execute: [] // host doesn't support network
    };

    const requestedByPackage: PluginPermissions = {
      read: ['package.current', 'app.version', 'package.dependencies'],
      write: ['plugin.settings', 'package.dynamic_files'],
      execute: ['network.request']
    };

    const resolved = resolvePermissions({
      declared,
      grantedByUser,
      requestedByPackage,
      hostCapabilities
    });

    expect(Array.from(resolved.read)).toEqual(['package.current', 'app.version', 'package.dependencies']);
    expect(Array.from(resolved.write)).toEqual(['plugin.settings']);
    expect(Array.from(resolved.execute)).toEqual([]);
  });

  it('grants no permissions when requestedByPackage is missing', () => {
    const declared: PluginPermissions = { read: ['package.current'], write: [], execute: [] };
    const grantedByUser: PluginPermissions = { read: ['package.current'], write: [], execute: [] };
    const hostCapabilities: PluginPermissions = { read: ['package.current'], write: [], execute: [] };

    const resolved = resolvePermissions({
      declared,
      grantedByUser,
      hostCapabilities
    });

    expect(Array.from(resolved.read)).toEqual([]);
    expect(Array.from(resolved.write)).toEqual([]);
    expect(Array.from(resolved.execute)).toEqual([]);
  });

  it('further intersects with package requested permissions if provided', () => {
    const declared: PluginPermissions = {
      read: ['package.current', 'app.version'],
      write: [],
      execute: []
    };

    const grantedByUser: PluginPermissions = {
      read: ['package.current', 'app.version'],
      write: [],
      execute: []
    };

    const hostCapabilities: PluginPermissions = {
      read: ['package.current', 'app.version'],
      write: [],
      execute: []
    };

    const requestedByPackage: PluginPermissions = {
      read: ['package.current'], // package only wants the plugin to read its own files, not app version
      write: [],
      execute: []
    };

    const resolved = resolvePermissions({
      declared,
      grantedByUser,
      requestedByPackage,
      hostCapabilities
    });

    expect(Array.from(resolved.read)).toEqual(['package.current']);
  });
});
