import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { AppConfig, Result } from '@learnlab/core-types';

export interface ConfigStoreError { type: 'not_found' | 'invalid_json' | 'invalid_shape' | 'io_error'; message: string; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isConfig(value: unknown): value is AppConfig {
  if (!isRecord(value) || !isRecord(value.workspace) || !isRecord(value.plugins) || (value.variables !== undefined && !isRecord(value.variables))) return false;
  if (value.workspace.lastOpenedPackage !== undefined && typeof value.workspace.lastOpenedPackage !== 'string') return false;
  return Object.values(value.plugins).every((settings) => isRecord(settings));
}

export function validateConfig(config: unknown): config is AppConfig { return isConfig(config); }

export async function readConfig(filePath: string, defaults: AppConfig): Promise<Result<AppConfig, ConfigStoreError>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    if (!isConfig(parsed)) return { ok: false, error: { type: 'invalid_shape', message: `Invalid config shape: ${filePath}` } };
    return { ok: true, value: {
      ...defaults, ...parsed,
      workspace: { ...defaults.workspace, ...parsed.workspace },
      plugins: { ...defaults.plugins, ...parsed.plugins },
      ...(parsed.variables || defaults.variables ? { variables: { ...(defaults.variables || {}), ...(parsed.variables || {}) } } : {})
    } };
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    if (cause.code === 'ENOENT') {
      if (!isConfig(defaults)) return { ok: false, error: { type: 'invalid_shape', message: 'Default config has an invalid shape' } };
      return { ok: true, value: defaults };
    }
    if (error instanceof SyntaxError) return { ok: false, error: { type: 'invalid_json', message: `Invalid JSON config: ${(error as Error).message}` } };
    return { ok: false, error: { type: 'io_error', message: cause.message } };
  }
}

export async function writeConfig(filePath: string, config: AppConfig): Promise<Result<void, ConfigStoreError>> {
  if (!isConfig(config)) return { ok: false, error: { type: 'invalid_shape', message: 'Cannot write invalid config shape' } };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
    return { ok: true, value: undefined };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return { ok: false, error: { type: 'io_error', message: (error as Error).message } };
  }
}
