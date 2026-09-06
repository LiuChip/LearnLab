import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createTarGz, parseTar } from '../packages/core/src/tar';

describe('tar archive safety', () => {
  it('rejects an archive with a corrupted header checksum', () => {
    const archive = createTarGz([{ name: 'payload.txt', data: 'content' }]);
    const tar = Buffer.from(gunzipSync(archive));
    tar[0] ^= 0x01;
    const corruptedArchive = gzipSync(tar);

    expect(() => parseTar(corruptedArchive)).toThrow('Tar header checksum mismatch');
  });

  it('enforces input, output, and entry limits', () => {
    const archive = createTarGz([
      { name: 'one.txt', data: 'one' },
      { name: 'two.txt', data: 'two' }
    ]);

    expect(() => parseTar(archive, { maxInputBytes: archive.length - 1 })).toThrow(
      'maximum input size'
    );
    expect(() => parseTar(archive, { maxUncompressedBytes: 512 })).toThrow(
      'maximum uncompressed size'
    );
    expect(() => parseTar(archive, { maxEntries: 1 })).toThrow('too many entries');
  });
});
