import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dependencyFingerprint, type DependencyMetadata } from '@learnlab/core-types';

export { dependencyFingerprint };
export type { DependencyMetadata };

export function calculateBufferSha256(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

export function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', (err) => reject(err));
  });
}

export async function calculateFileStats(
  filePath: string
): Promise<{ size: number; sha256: string }> {
  const fileStat = await stat(filePath);
  const sha256 = await calculateFileSha256(filePath);
  return { size: fileStat.size, sha256 };
}
