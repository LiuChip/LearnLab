import { gunzipSync, gzipSync } from 'node:zlib';

export interface TarEntry {
  name: string;
  mode: number;
  size: number;
  mtime: number;
  type: string;
  linkname?: string;
  data: Buffer;
}

export interface TarParseOptions {
  maxInputBytes?: number;
  maxUncompressedBytes?: number;
  maxEntries?: number;
}

export interface TarInputEntry {
  name: string;
  data?: Buffer | string;
  mode?: number;
  type?: '0' | '2' | '5'; // '0'=file, '2'=symlink, '5'=directory
  linkname?: string;
}

function parseOctal(buffer: Buffer, offset: number, length: number): number {
  const str = buffer
    .toString('utf8', offset, offset + length)
    .replace(/\0.*$/, '')
    .trim();
  if (!str) return 0;
  return parseInt(str, 8) || 0;
}

function readNullTerminatedString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const nullIndex = slice.indexOf(0);
  const actualLength = nullIndex === -1 ? length : nullIndex;
  return slice.subarray(0, actualLength).toString('utf8');
}

function verifyHeaderChecksum(header: Buffer): void {
  const stored = parseOctal(header, 148, 8);
  if (!Number.isSafeInteger(stored) || stored < 0) throw new Error('Invalid tar header checksum');

  let calculated = 0;
  for (let index = 0; index < header.length; index += 1) {
    calculated += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (calculated !== stored) throw new Error('Tar header checksum mismatch');
}

export function parseTar(input: Buffer, options: TarParseOptions = {}): TarEntry[] {
  const maxInputBytes = options.maxInputBytes ?? 256 * 1024 * 1024;
  const maxUncompressedBytes = options.maxUncompressedBytes ?? 512 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 100_000;
  if (input.length > maxInputBytes) throw new Error('Tar archive exceeds maximum input size');
  let buffer = input;
  // If gzipped, gunzip first
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      buffer = gunzipSync(buffer, { maxOutputLength: maxUncompressedBytes });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (error instanceof RangeError || code === 'ERR_BUFFER_TOO_LARGE') {
        throw new Error('Tar archive exceeds maximum uncompressed size');
      }
      throw error;
    }
  }

  if (buffer.length > maxUncompressedBytes)
    throw new Error('Tar archive exceeds maximum uncompressed size');

  const entries: TarEntry[] = [];
  let offset = 0;
  let sawEnd = false;
  let nextLongName: string | null = null;
  let nextLongLinkName: string | null = null;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);

    // Check for empty block (end of archive)
    const isZeroBlock = header.every((b) => b === 0);
    if (isZeroBlock) {
      // End of archive
      sawEnd = true;
      break;
    }

    verifyHeaderChecksum(header);

    let name = readNullTerminatedString(header, 0, 100);
    const mode = parseOctal(header, 100, 8);
    const size = parseOctal(header, 124, 12);
    const mtime = parseOctal(header, 136, 12);
    const typeflag = String.fromCharCode(header[156] || 48); // default '0'
    const linkname = readNullTerminatedString(header, 157, 100);
    const magic = readNullTerminatedString(header, 257, 6);

    if (magic.startsWith('ustar')) {
      const prefix = readNullTerminatedString(header, 345, 155);
      if (prefix) {
        name = `${prefix}/${name}`;
      }
    }

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const padding = (512 - (size % 512)) % 512;
    const nextOffset = dataEnd + padding;

    if (dataEnd > buffer.length) {
      throw new Error('Unexpected EOF reading tar entry data');
    }

    const data = buffer.subarray(dataStart, dataEnd);

    if (typeflag === 'L') {
      // GNU Long Name
      nextLongName = data.toString('utf8').replace(/\0.*$/, '');
    } else if (typeflag === 'K') {
      // GNU Long Link Name
      nextLongLinkName = data.toString('utf8').replace(/\0.*$/, '');
    } else {
      const finalName = nextLongName ?? name;
      const finalLinkName = nextLongLinkName ?? (linkname || undefined);
      nextLongName = null;
      nextLongLinkName = null;

      if (entries.length >= maxEntries) throw new Error('Tar archive contains too many entries');
      entries.push({
        name: finalName,
        mode: mode || 0o644,
        size,
        mtime,
        type: typeflag,
        linkname: finalLinkName,
        data: Buffer.from(data)
      });
    }

    offset = nextOffset;
  }

  if (!sawEnd) throw new Error('Tar archive is missing its end marker');
  return entries;
}

export function createTar(entries: TarInputEntry[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const isDir = entry.type === '5' || entry.name.endsWith('/');
    const isSymlink = entry.type === '2';
    const type = isSymlink ? '2' : isDir ? '5' : '0';

    let dataBuffer: Buffer = Buffer.alloc(0);
    if (!isDir && !isSymlink && entry.data) {
      dataBuffer = Buffer.from(entry.data);
    }

    const name = entry.name;
    const linkname = entry.linkname ?? '';
    const size = isSymlink || isDir ? 0 : dataBuffer.length;
    const mode = entry.mode ?? (isDir ? 0o755 : 0o644);
    const mtime = Math.floor(Date.now() / 1000);

    // If name is longer than 100 bytes, create GNU long name entry
    const nameBytes = Buffer.from(name, 'utf8');
    if (nameBytes.length > 100) {
      const longNameData = Buffer.concat([nameBytes, Buffer.from([0])]);
      const longHeader = Buffer.alloc(512);
      longHeader.write('././@LongLink', 0, 100, 'utf8');
      longHeader.write('0000644\0', 100, 8, 'utf8');
      longHeader.write('0000000\0', 108, 8, 'utf8');
      longHeader.write('0000000\0', 116, 8, 'utf8');
      longHeader.write(`${longNameData.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
      longHeader.write(`${mtime.toString(8).padStart(11, '0')}\0`, 136, 12, 'utf8');
      longHeader.write('        ', 148, 8, 'utf8');
      longHeader[156] = 'L'.charCodeAt(0);
      longHeader.write('ustar  \0', 257, 8, 'utf8');

      // Calculate checksum
      let chksum = 0;
      for (let i = 0; i < 512; i++) chksum += longHeader[i];
      longHeader.write(`${chksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');

      blocks.push(longHeader);
      blocks.push(longNameData);
      const pad = (512 - (longNameData.length % 512)) % 512;
      if (pad > 0) blocks.push(Buffer.alloc(pad));
    }

    const header = Buffer.alloc(512);
    header.write(name.slice(0, 100), 0, 100, 'utf8');
    header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'utf8');
    header.write('0000000\0', 108, 8, 'utf8');
    header.write('0000000\0', 116, 8, 'utf8');
    header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
    header.write(`${mtime.toString(8).padStart(11, '0')}\0`, 136, 12, 'utf8');
    header.write('        ', 148, 8, 'utf8');
    header[156] = type.charCodeAt(0);
    if (linkname) {
      header.write(linkname.slice(0, 100), 157, 100, 'utf8');
    }
    header.write('ustar  \0', 257, 8, 'utf8');

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');

    blocks.push(header);
    if (size > 0) {
      blocks.push(dataBuffer);
      const pad = (512 - (size % 512)) % 512;
      if (pad > 0) blocks.push(Buffer.alloc(pad));
    }
  }

  // Two 512-byte zero blocks at end of archive
  blocks.push(Buffer.alloc(1024));

  return Buffer.concat(blocks);
}

export function createTarGz(entries: TarInputEntry[]): Buffer {
  const tarBuffer = createTar(entries);
  return gzipSync(tarBuffer);
}
