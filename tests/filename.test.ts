import { describe, expect, it } from 'vitest';
import { outputFilename, safeFilename, withPdfExtension } from '../src/lib/download.ts';
import { formatBytes } from '../src/lib/limits.ts';
import { combineOrient, orientFromExif, readJpegOrientation, swapsAxes } from '../src/lib/exif.ts';

describe('safeFilename', () => {
  it('keeps spaces and hyphens, which people actually use', () => {
    expect(safeFilename('scan 01')).toBe('scan 01');
    expect(safeFilename('invoice-march')).toBe('invoice-march');
  });

  it('strips characters the filesystem refuses', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('falls back to the app name when nothing usable is left', () => {
    expect(safeFilename('')).toBe('stackly');
    expect(safeFilename('///')).toBe('stackly');
    expect(safeFilename('   ')).toBe('stackly');
  });

  it('does not double up the extension', () => {
    expect(withPdfExtension('report.pdf')).toBe('report.pdf');
    expect(withPdfExtension('report')).toBe('report.pdf');
  });

  it('caps runaway names', () => {
    expect(safeFilename('x'.repeat(500)).length).toBe(80);
  });
});

describe('outputFilename', () => {
  it('uses the typed name when there is one', () => {
    expect(outputFilename('march invoices', 'scan.png')).toBe('march invoices');
  });

  it('falls back to the first file, minus its extension, when blank', () => {
    expect(outputFilename('', 'Quarterly Report.docx')).toBe('Quarterly Report');
    expect(outputFilename('   ', 'archive.tar.gz')).toBe('archive.tar');
  });

  it('keeps names that have no extension, or are only a dotfile', () => {
    expect(outputFilename('', 'README')).toBe('README');
    expect(outputFilename('', '.notes')).toBe('.notes');
  });

  it('is blank with no files, leaving the app-name fallback to safeFilename', () => {
    expect(outputFilename('', undefined)).toBe('');
    expect(withPdfExtension(outputFilename('', undefined))).toBe('stackly.pdf');
  });
});

describe('formatBytes', () => {
  it('scales units and keeps the numbers readable', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB');
  });
});

describe('EXIF orientation', () => {
  it('returns upright for data that is not a JPEG', () => {
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(readJpegOrientation(new Uint8Array(0))).toBe(1);
  });

  it('returns upright for a JPEG with no EXIF segment', () => {
    // SOI, then a JFIF APP0 segment, then start of scan.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda]);
    expect(readJpegOrientation(bytes)).toBe(1);
  });

  it('reads a little-endian EXIF orientation tag', () => {
    expect(readJpegOrientation(makeExifJpeg(6, true))).toBe(6);
  });

  it('reads a big-endian EXIF orientation tag', () => {
    expect(readJpegOrientation(makeExifJpeg(8, false))).toBe(8);
  });

  it('maps every EXIF value to a transform', () => {
    expect(orientFromExif(1)).toEqual({ rotate: 0, flipX: false });
    expect(orientFromExif(3)).toEqual({ rotate: 180, flipX: false });
    expect(orientFromExif(6)).toEqual({ rotate: 90, flipX: false });
    expect(orientFromExif(8)).toEqual({ rotate: 270, flipX: false });
    // Out-of-range values fall back to upright rather than throwing.
    expect(orientFromExif(99)).toEqual({ rotate: 0, flipX: false });
  });

  it('adds a user rotation on top of the source orientation', () => {
    expect(combineOrient({ rotate: 90, flipX: false }, 90)).toEqual({ rotate: 180, flipX: false });
    expect(combineOrient({ rotate: 270, flipX: true }, 180)).toEqual({ rotate: 90, flipX: true });
    expect(combineOrient({ rotate: 270, flipX: false }, 90)).toEqual({ rotate: 0, flipX: false });
  });

  it('knows which rotations swap width and height', () => {
    expect(swapsAxes({ rotate: 90, flipX: false })).toBe(true);
    expect(swapsAxes({ rotate: 270, flipX: true })).toBe(true);
    expect(swapsAxes({ rotate: 180, flipX: false })).toBe(false);
  });
});

/** Minimal JPEG carrying an EXIF APP1 segment with one orientation tag. */
function makeExifJpeg(orientation: number, littleEndian: boolean): Uint8Array {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);

  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d, false); // byte order
  view.setUint16(2, 0x002a, littleEndian); // magic
  view.setUint32(4, 8, littleEndian); // offset to IFD0
  view.setUint16(8, 1, littleEndian); // one entry
  view.setUint16(10, 0x0112, littleEndian); // orientation tag
  view.setUint16(12, 3, littleEndian); // SHORT
  view.setUint32(14, 1, littleEndian); // count
  view.setUint16(18, orientation, littleEndian); // value

  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const segmentLength = 2 + header.length + tiff.length;

  const bytes = new Uint8Array(4 + segmentLength + 2);
  bytes.set([0xff, 0xd8, 0xff, 0xe1], 0);
  new DataView(bytes.buffer).setUint16(4, segmentLength, false);
  bytes.set(header, 6);
  bytes.set(tiff, 6 + header.length);
  bytes.set([0xff, 0xda], 4 + segmentLength);

  return bytes;
}
