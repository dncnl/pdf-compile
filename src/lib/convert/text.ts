import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MARGINS_MM, PAGE_SIZES_PT, mmToPt } from '../geometry.ts';
import type { OutputSettings } from '../types.ts';

const FONT_SIZE = 11;
const LINE_HEIGHT = FONT_SIZE * 1.45;

/**
 * Lay plain text out as real PDF text objects — selectable, searchable, and a
 * few KB per page. Also the fallback target when a DOCX fails to render.
 */
export async function appendText(
  out: PDFDocument,
  text: string,
  settings: OutputSettings,
): Promise<number> {
  const font = await out.embedFont(StandardFonts.Helvetica);

  const [baseW, baseH] =
    settings.pageSize === 'original' ? PAGE_SIZES_PT.a4 : PAGE_SIZES_PT[settings.pageSize];
  const [pageW, pageH] =
    settings.orientation === 'landscape' ? [baseH, baseW] : [baseW, baseH];

  // Text always needs breathing room, even when images are set edge to edge.
  const margin = Math.max(mmToPt(MARGINS_MM[settings.margin]), mmToPt(12));
  const maxWidth = pageW - margin * 2;

  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => wrapLine(line, font, maxWidth));

  const linesPerPage = Math.max(1, Math.floor((pageH - margin * 2) / LINE_HEIGHT));
  let pages = 0;

  for (let i = 0; i < Math.max(lines.length, 1); i += linesPerPage) {
    const page = out.addPage([pageW, pageH]);
    pages++;
    let y = pageH - margin - FONT_SIZE;

    for (const line of lines.slice(i, i + linesPerPage)) {
      if (line.length > 0) {
        page.drawText(line, { x: margin, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      }
      y -= LINE_HEIGHT;
    }
  }

  return pages;
}

/**
 * Greedy word wrap. Words longer than the line (URLs, hashes) are broken by
 * character so nothing runs off the page.
 */
function wrapLine(
  line: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  maxWidth: number,
): string[] {
  // Standard PDF fonts are WinAnsi-encoded and throw on characters outside it.
  const safe = sanitizeForWinAnsi(line);
  if (safe.length === 0) return [''];
  if (font.widthOfTextAtSize(safe, FONT_SIZE) <= maxWidth) return [safe];

  const out: string[] = [];
  let current = '';

  for (const word of safe.split(/(\s+)/)) {
    const candidate = current + word;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current.trim().length > 0) {
      out.push(current.trimEnd());
      current = '';
    }

    if (font.widthOfTextAtSize(word, FONT_SIZE) <= maxWidth) {
      current = word.trimStart();
      continue;
    }

    // A single unbreakable run wider than the page.
    let chunk = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, FONT_SIZE) > maxWidth) {
        out.push(chunk);
        chunk = '';
      }
      chunk += char;
    }
    current = chunk;
  }

  if (current.trim().length > 0) out.push(current.trimEnd());
  return out.length > 0 ? out : [''];
}

/**
 * Replace characters Helvetica's WinAnsi encoding cannot represent. Smart
 * quotes and dashes get sensible ASCII stand-ins; anything else becomes '?'
 * rather than throwing partway through a document.
 */
export function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/\t/g, '    ')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•●]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}
