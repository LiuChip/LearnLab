import { readFile } from 'node:fs/promises';
import { calculateBufferSha256 } from './dependency-fingerprint';

export function calculateContentFingerprint(content: string): string {
  // Normalize CRLF to LF so cross-platform edits don't invalidate progress
  const normalized = content.replace(/\r\n/g, '\n');
  return calculateBufferSha256(Buffer.from(normalized, 'utf8'));
}

export async function calculateChapterFileFingerprint(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf8');
  return calculateContentFingerprint(content);
}
