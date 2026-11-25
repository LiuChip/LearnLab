import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLearnLabHome } from './paths';

export function createPluginGrantKey(scope: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}

function grantPath(key: string): string {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid plugin grant key');
  return join(getLearnLabHome(), 'plugin-grants', key);
}

export async function hasPluginGrant(key: string): Promise<boolean> {
  try {
    return await readFile(grantPath(key), 'utf8') === 'allowed\n';
  } catch {
    return false;
  }
}

export async function savePluginGrant(key: string): Promise<void> {
  const target = grantPath(key);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(join(getLearnLabHome(), 'plugin-grants'), { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, 'allowed\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
