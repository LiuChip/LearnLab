import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { PluginManifest, PluginRequirement, Result } from '@learnlab/core-types';

export interface PluginManifestError {
  type: 'invalid_manifest' | 'read_error';
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function readStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new TypeError(`${field} must be an array of non-empty strings`);
  }
  return value;
}

function readRequirements(value: unknown): PluginRequirement[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError('requires_plugins must be an array');
  return value.map((item, index) => {
    if (!isRecord(item)) throw new TypeError(`requires_plugins[${index}] must be an object`);
    const id = readString(item.id, `requires_plugins[${index}].id`, true)!;
    const version = readString(item.version, `requires_plugins[${index}].version`, true)!;
    return { id, version };
  });
}

export function parsePluginManifest(raw: unknown): Result<PluginManifest, PluginManifestError> {
  try {
    if (!isRecord(raw)) throw new TypeError('manifest must be an object');
    const plugin_id = readString(raw.plugin_id, 'plugin_id', true)!;
    const version = readString(raw.version, 'version', true)!;
    const activation = raw.activation;
    let normalizedActivation: PluginManifest['activation'];
    if (activation !== undefined) {
      if (!isRecord(activation) || (activation.mode !== 'global' && activation.mode !== 'package')) {
        throw new TypeError('activation.mode must be global or package');
      }
      normalizedActivation = { mode: activation.mode };
    }

    const apiVersion = raw.api_version;
    if (apiVersion !== undefined && (!Number.isInteger(apiVersion) || Number(apiVersion) < 0)) {
      throw new TypeError('api_version must be a non-negative integer');
    }
    if (raw.breaking_change !== undefined && typeof raw.breaking_change !== 'boolean') {
      throw new TypeError('breaking_change must be a boolean');
    }

    const manifest: PluginManifest = {
      plugin_id,
      version,
      ...(readString(raw.author, 'author') ? { author: readString(raw.author, 'author') } : {}),
      ...(readString(raw.signature, 'signature') ? { signature: readString(raw.signature, 'signature') } : {}),
      ...(apiVersion !== undefined ? { api_version: Number(apiVersion) } : {}),
      ...(normalizedActivation ? { activation: normalizedActivation } : {}),
      ...(readStringArray(raw.provides, 'provides') ? { provides: readStringArray(raw.provides, 'provides') } : {}),
      ...(readRequirements(raw.requires_plugins) ? { requires_plugins: readRequirements(raw.requires_plugins) } : {}),
      ...(raw.permissions !== undefined ? { permissions: readPermissions(raw.permissions) } : {}),
      ...(raw.breaking_change !== undefined ? { breaking_change: raw.breaking_change } : {})
    };
    return { ok: true, value: manifest };
  } catch (error) {
    return {
      ok: false,
      error: {
        type: 'invalid_manifest',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function readPermissions(value: unknown): NonNullable<PluginManifest['permissions']> {
  if (!isRecord(value)) throw new TypeError('permissions must be an object');
  return {
    ...(readStringArray(value.read, 'permissions.read') ? { read: readStringArray(value.read, 'permissions.read') } : {}),
    ...(readStringArray(value.write, 'permissions.write') ? { write: readStringArray(value.write, 'permissions.write') } : {}),
    ...(readStringArray(value.execute, 'permissions.execute') ? { execute: readStringArray(value.execute, 'permissions.execute') } : {})
  };
}

export async function loadPluginManifest(filePath: string): Promise<Result<PluginManifest, PluginManifestError>> {
  try {
    const raw = parseYaml(await readFile(filePath, 'utf8')) as unknown;
    return parsePluginManifest(raw);
  } catch (error) {
    return {
      ok: false,
      error: {
        type: 'read_error',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
