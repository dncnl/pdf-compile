import { describe, expect, it } from 'vitest';
import { detect, extensionOf } from '../src/lib/detect.ts';

/** Build a header from byte values, padded out so offset checks have room. */
function head(...bytes: number[]): Uint8Array<ArrayBuffer> {
  const buffer = new Uint8Array(64);
  buffer.set(bytes, 0);
  return buffer;
}

/** Writes ASCII at an offset. Returns the same buffer so calls can nest. */
function withAscii(
  offset: number,
  text: string,
  base: Uint8Array<ArrayBuffer> = new Uint8Array(64),
): Uint8Array<ArrayBuffer> {
  for (let i = 0; i < text.length; i++) base[offset + i] = text.charCodeAt(i);
  return base;
}

describe('extensionOf', () => {
  it('lowercases and handles dotted names', () => {
    expect(extensionOf('Scan.PDF')).toBe('pdf');
    expect(extensionOf('my.report.final.docx')).toBe('docx');
    expect(extensionOf('README')).toBe('');
  });
});

describe('detect', () => {
  it('identifies a PDF by its header', () => {
    const bytes = withAscii(0, '%PDF-1.7\n');
    expect(detect(bytes, 'a.pdf')).toEqual({ ok: true, kind: 'pdf', format: 'pdf' });
  });

  it('finds a PDF header that is not at offset zero', () => {
    // Real-world PDFs sometimes carry junk before the header; the spec allows
    // it anywhere in the first 1024 bytes.
    const bytes = withAscii(120, '%PDF-1.4', new Uint8Array(512));
    expect(detect(bytes, 'a.pdf').ok).toBe(true);
  });

  it('identifies raster formats by signature', () => {
    expect(detect(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'x.png')).toMatchObject({
      kind: 'image',
      format: 'png',
    });
    expect(detect(head(0xff, 0xd8, 0xff, 0xe0), 'x.jpg')).toMatchObject({ format: 'jpeg' });
    expect(detect(withAscii(0, 'GIF89a'), 'x.gif')).toMatchObject({ format: 'gif' });
    expect(detect(head(0x42, 0x4d), 'x.bmp')).toMatchObject({ format: 'bmp' });
  });

  it('identifies WebP by the RIFF container plus the WEBP tag at offset 8', () => {
    const bytes = withAscii(8, 'WEBP', withAscii(0, 'RIFF'));
    expect(detect(bytes, 'x.webp')).toMatchObject({ kind: 'image', format: 'webp' });
  });

  it('does not mistake a non-WebP RIFF file for an image', () => {
    const bytes = withAscii(8, 'WAVE', withAscii(0, 'RIFF'));
    expect(detect(bytes, 'x.wav').ok).toBe(false);
  });

  it('identifies AVIF and rejects HEIC with an actionable message', () => {
    const avif = withAscii(8, 'avif', withAscii(4, 'ftyp'));
    expect(detect(avif, 'x.avif')).toMatchObject({ kind: 'image', format: 'avif' });

    const heic = withAscii(8, 'heic', withAscii(4, 'ftyp'));
    const result = detect(heic, 'x.heic');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/JPEG or PNG/);
  });

  it('trusts content over extension when the bytes are conclusive', () => {
    // A PDF someone renamed to .jpg is still a PDF.
    expect(detect(withAscii(0, '%PDF-1.5'), 'photo.jpg')).toMatchObject({ kind: 'pdf' });
    // And a PNG named .pdf is still a PNG.
    expect(detect(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'doc.pdf')).toMatchObject({
      kind: 'image',
    });
  });

  it('uses the extension to tell OOXML containers apart', () => {
    const zip = head(0x50, 0x4b, 0x03, 0x04);
    expect(detect(zip, 'report.docx')).toMatchObject({ kind: 'docx' });

    const xlsx = detect(zip, 'budget.xlsx');
    expect(xlsx.ok).toBe(false);
    if (!xlsx.ok) expect(xlsx.reason).toMatch(/Excel/);

    const pptx = detect(zip, 'deck.pptx');
    expect(pptx.ok).toBe(false);
    if (!pptx.ok) expect(pptx.reason).toMatch(/PowerPoint/);

    const plain = detect(zip, 'photos.zip');
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(plain.reason).toMatch(/Zip archives/);
  });

  it('points legacy .doc files at Save As', () => {
    const ole = head(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    const result = detect(ole, 'old.doc');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/\.docx/);
  });

  it('accepts plain text only with a known extension and no NUL bytes', () => {
    // Not padded: a real sniff is a slice of the file, so a short text file
    // arrives with no trailing NULs.
    const text = new TextEncoder().encode('hello world');
    expect(detect(text, 'notes.txt')).toMatchObject({ kind: 'text' });
    expect(detect(text, 'notes.md')).toMatchObject({ kind: 'text' });
    expect(detect(text, 'notes.bin').ok).toBe(false);

    const binary = new Uint8Array([0x68, 0x69, 0x00, 0x01]);
    expect(detect(binary, 'notes.txt').ok).toBe(false);
  });

  it('rejects TIFF with a conversion hint', () => {
    const result = detect(head(0x49, 0x49, 0x2a, 0x00), 'scan.tif');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/TIFF/);
  });

  it('rejects anything it cannot place', () => {
    expect(detect(head(0x00, 0x01, 0x02, 0x03), 'mystery.dat').ok).toBe(false);
  });
});
