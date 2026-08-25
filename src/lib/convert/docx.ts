import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas-pro';
import { blobToBytes, surfaceToBlob } from '../canvas.ts';
import { PX_TO_PT } from '../geometry.ts';
import { LIMITS } from '../limits.ts';
import { sanitizeRenderedDocx } from '../sanitize.ts';
import { AppError } from '../types.ts';

export interface DocxPage {
  bytes: Uint8Array;
  widthPt: number;
  heightPt: number;
}

const HOST_ID = 'docx-host';

const RENDER_OPTIONS = {
  className: 'docx',
  inWrapper: true,
  breakPages: true,
  ignoreLastRenderedPageBreak: false,
  // Inline every embedded image as a data: URL. Keeps the canvas untainted and
  // means the rendered document makes no requests of its own.
  useBase64URL: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  experimental: true,
  trimXmlDeclaration: true,
  debug: false,
} as const;

function getHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    document.body.append(host);
  }
  return host;
}

export function clearDocxHost(): void {
  document.getElementById(HOST_ID)?.replaceChildren();
}

/**
 * Lay a .docx out as real pages in a hidden part of the document.
 *
 * docx-preview reproduces Word's pagination, so each `section.docx` it emits
 * is one page at its true dimensions. Returns the sections for the caller to
 * measure or rasterize; the host stays populated until `clearDocxHost` runs.
 */
async function layoutDocx(file: File): Promise<HTMLElement[]> {
  const host = getHost();
  host.replaceChildren();

  try {
    await renderAsync(file, host, undefined, RENDER_OPTIONS);
  } catch {
    throw new AppError('This Word document couldn’t be laid out.');
  }

  sanitizeRenderedDocx(host);

  const sections = Array.from(host.querySelectorAll<HTMLElement>('section.docx'));
  if (sections.length === 0) {
    throw new AppError('This Word document appears to be empty.');
  }
  return sections;
}

/**
 * Count the pages a .docx contributes and snapshot the first one, from a
 * single layout pass. Laying a document out is the expensive part, so the
 * probe does both jobs in one go.
 */
export async function probeDocx(file: File): Promise<{ pageCount: number; thumb: Blob }> {
  const sections = await layoutDocx(file);
  try {
    return { pageCount: sections.length, thumb: await snapshotBlob(sections[0]!) };
  } finally {
    clearDocxHost();
  }
}

/**
 * Snapshot each laid-out page into a JPEG.
 *
 * The output is images, not text. No browser-side converter produces faithful
 * Word layout *and* real text objects — the only thing that does is a
 * server-side LibreOffice pass, which would mean uploading the document and
 * would cost the guarantee that nothing leaves the tab. For a merge tool,
 * looking right is the side of that trade worth taking.
 */
export async function rasterizeDocx(
  file: File,
  onPage?: (done: number, total: number) => void,
): Promise<DocxPage[]> {
  const sections = await layoutDocx(file);

  try {
    const pages: DocxPage[] = [];

    for (const [index, section] of sections.entries()) {
      const rect = section.getBoundingClientRect();
      pages.push({
        bytes: await snapshot(section),
        widthPt: Math.max(1, rect.width * PX_TO_PT),
        heightPt: Math.max(1, rect.height * PX_TO_PT),
      });
      onPage?.(index + 1, sections.length);
    }

    return pages;
  } finally {
    clearDocxHost();
  }
}

async function snapshot(element: HTMLElement): Promise<Uint8Array> {
  return blobToBytes(await snapshotBlob(element));
}

async function snapshotBlob(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: LIMITS.DOCX_SCALE,
    backgroundColor: '#ffffff',
    useCORS: false,
    allowTaint: false,
    logging: false,
    imageTimeout: 0,
  });

  try {
    return await surfaceToBlob(canvas, 'image/jpeg', LIMITS.JPEG_QUALITY);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Plain-text fallback for documents that fail to lay out. */
export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser.js');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}
