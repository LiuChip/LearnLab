import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateChapterFileFingerprint, calculateContentFingerprint } from '../packages/core/src';

describe('content fingerprinting', () => {
  it('normalizes CRLF to LF so same content produces identical hash across OS', () => {
    const unixText = '# Title\n\nLine 1\nLine 2\n';
    const windowsText = '# Title\r\n\r\nLine 1\r\nLine 2\r\n';

    const hashUnix = calculateContentFingerprint(unixText);
    const hashWin = calculateContentFingerprint(windowsText);

    expect(hashUnix).toBe(hashWin);
    expect(hashUnix.length).toBe(64);
  });

  it('produces different hash when content changes', () => {
    const text1 = '# Title\nOriginal content';
    const text2 = '# Title\nEdited content';

    const hash1 = calculateContentFingerprint(text1);
    const hash2 = calculateContentFingerprint(text2);

    expect(hash1).not.toBe(hash2);
  });

  it('calculates chapter file fingerprint from disk', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'learnlab-fp-'));
    try {
      const filePath = path.join(root, 'chapter.md');
      await writeFile(filePath, '# Chapter\nBody text\r\n');

      const hash = await calculateChapterFileFingerprint(filePath);
      const expected = calculateContentFingerprint('# Chapter\nBody text\n');

      expect(hash).toBe(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
