import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { AppConfig, Result } from '@learnlab/core-types';

export interface ConfigStoreError { type: 'not_found' | 'invalid_json' | 'io_error'; message: string }

export async function readConfig(filePath: string, defaults: AppConfig): Promise<Result<AppConfig, ConfigStoreError>> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<AppConfig>;
    return { ok: true, value: {
      ...defaults,
      ...parsed,
      workspace: { ...defaults.workspace, ...(parsed.workspace ?? {}) },
      plugins: { ...defaults.plugins, ...(parsed.plugins ?? {}) }
    } };
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    if (cause.code === 'ENOENT') return { ok: false, error: { type: 'not_found', message: `Config file not found: ${filePath}` } };
    if (error instanceof SyntaxError) return { ok: false, error: { type: 'invalid_json', message: `Invalid JSON config: ${error.message}` } };
    return { ok: false, error: { type: 'io_error', message: cause.message } };
  }
}

export async function writeConfig(filePath: string, config: AppConfig): Promise<Result<void, ConfigStoreError>> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
    return { ok: true, value: undefined };
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return { ok: false, error: { type: 'io_error', message: cause.message } };
  }
}
