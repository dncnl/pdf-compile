import type { SourceKind } from './types.ts';

export type DetectResult =
  | { ok: true; kind: SourceKind; format: string }
  | { ok: false; reason: string };

/** Bytes to sniff. The PDF spec allows the header anywhere in the first 1024. */
export const SNIFF_BYTES = 1024;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'log', 'text']);

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = offset; i < offset + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

function matches(bytes: Uint8Array, offset: number, sig: readonly number[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((byte, i) => bytes[offset + i] === byte);
}

function indexOfAscii(bytes: Uint8Array, needle: string, limit: number): number {
  const end = Math.min(bytes.length, limit) - needle.length;
  for (let i = 0; i <= end; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * Identify a file from its leading bytes.
 *
 * Content decides the type wherever the bytes are conclusive — a PDF renamed
 * to .jpg is still a PDF, and honouring that is both friendlier and safer than
 * trusting a label anyone can change. The extension is consulted only where
 * the container is genuinely ambiguous: every OOXML file (.docx/.xlsx/.pptx)
 * is a ZIP with the same first four bytes, and plain text has no signature at
 * all.
 */
export function detect(head: Uint8Array, filename: string): DetectResult {
  const ext = extensionOf(filename);

  // ---- Conclusive binary signatures ----
  if (indexOfAscii(head, '%PDF-', SNIFF_BYTES) !== -1) {
    return { ok: true, kind: 'pdf', format: 'pdf' };
  }
  if (matches(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, kind: 'image', format: 'png' };
  }
  if (matches(head, 0, [0xff, 0xd8, 0xff])) {
    return { ok: true, kind: 'image', format: 'jpeg' };
  }
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') {
    return { ok: true, kind: 'image', format: 'gif' };
  }
  if (matches(head, 0, [0x42, 0x4d])) {
    return { ok: true, kind: 'image', format: 'bmp' };
  }
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') {
    return { ok: true, kind: 'image', format: 'webp' };
  }

  // ---- ISO base media containers (AVIF, HEIC) share a 'ftyp' box ----
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4);
    if (brand === 'avif' || brand === 'avis') {
      return { ok: true, kind: 'image', format: 'avif' };
    }
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return {
        ok: false,
        reason: 'HEIC photos aren’t supported. Export as JPEG or PNG and try again.',
      };
    }
    return { ok: false, reason: 'This looks like a video or media container, not a document.' };
  }

  if (matches(head, 0, [0x49, 0x49, 0x2a, 0x00]) || matches(head, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    return {
      ok: false,
      reason: 'TIFF images aren’t supported. Convert to JPEG or PNG and try again.',
    };
  }

  // ---- ZIP container: only the extension can tell OOXML types apart ----
  if (matches(head, 0, [0x50, 0x4b, 0x03, 0x04]) || matches(head, 0, [0x50, 0x4b, 0x05, 0x06])) {
    if (ext === 'docx') return { ok: true, kind: 'docx', format: 'docx' };
    if (ext === 'doc') {
      return { ok: false, reason: 'Save this as .docx in Word and try again.' };
    }
    if (['xlsx', 'xlsm', 'xls'].includes(ext)) {
      return { ok: false, reason: 'Excel files aren’t supported yet.' };
    }
    if (['pptx', 'ppt'].includes(ext)) {
      return { ok: false, reason: 'PowerPoint files aren’t supported yet.' };
    }
    return { ok: false, reason: 'Zip archives aren’t supported. Add the files inside instead.' };
  }

  // Legacy binary .doc (OLE compound file).
  if (matches(head, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { ok: false, reason: 'Save this as .docx in Word and try again.' };
  }

  // ---- Plain text: no signature exists, so require a known extension ----
  if (TEXT_EXTENSIONS.has(ext) && !head.includes(0x00)) {
    return { ok: true, kind: 'text', format: ext || 'txt' };
  }

  return { ok: false, reason: 'Stackly can’t read this file type.' };
}

/** Read just enough of a file to identify it. */
export async function detectFile(file: File): Promise<DetectResult> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return detect(head, file.name);
}
