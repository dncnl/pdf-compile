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

  const sections = Array.from(host.querySelectorAll<HTMLElement>('section.docx')).flatMap(
    paginateSection,
  );
  if (sections.length === 0) {
    throw new AppError('This Word document appears to be empty.');
  }
  return sections;
}

/**
 * Split one rendered page that overflows its paper size into real pages.
 *
 * docx-preview only starts a new page where the file records one — an explicit
 * break, or the page breaks Word saves after laying a document out. Documents
 * from Google Docs, generators, or anything that never went through Word's
 * layout carry neither, and come out as a single page as tall as the whole
 * document. This re-flows that page at block boundaries (paragraphs, table
 * rows), repeating the header and footer on every page, so nothing is cut
 * through the middle of a line.
 *
 * A single block taller than a page — a huge image — is left on its own
 * oversized page rather than sliced.
 */
function paginateSection(section: HTMLElement): HTMLElement[] {
  const pageHeight = parseFloat(getComputedStyle(section).minHeight);
  if (!(pageHeight > 0) || section.offsetHeight <= pageHeight + 1) return [section];

  const children = Array.from(section.children) as HTMLElement[];
  const articles = children.filter((child) => child.tagName === 'ARTICLE');
  if (articles.length === 0) return [section];

  // Everything that isn't body flow — margins, header, footer, notes — repeats
  // (or at least reserves its space) on every page.
  const flowHeight = articles.reduce((sum, article) => sum + article.offsetHeight, 0);
  const available = pageHeight - (section.offsetHeight - flowHeight) - 1;
  if (available < pageHeight * 0.25) return [section];

  for (const article of articles) {
    for (const child of Array.from(article.children)) {
      if (child instanceof HTMLTableElement && child.offsetHeight > available) {
        splitTable(child, available);
      }
    }
  }

  // Group blocks into pages by where they actually sit in the long layout.
  // Measured before anything moves, so every rect is from the same layout.
  type Block = { article: HTMLElement; element: Element };
  const pages: Block[][] = [];
  let current: Block[] = [];
  let pageTop = 0;

  for (const article of articles) {
    for (const element of Array.from(article.children)) {
      const rect = element.getBoundingClientRect();
      if (current.length === 0) {
        pageTop = rect.top;
      } else if (rect.bottom - pageTop > available) {
        pages.push(current);
        current = [];
        pageTop = rect.top;
      }
      current.push({ article, element });
    }
  }
  if (current.length > 0) pages.push(current);
  if (pages.length <= 1) return [section];

  const header = children.find((child) => child.tagName === 'HEADER');
  const footer = children.find((child) => child.tagName === 'FOOTER');
  // Footnotes and endnotes belong after the text they annotate.
  const notes = children.filter(
    (child) => child !== header && child !== footer && !articles.includes(child),
  );

  const result = [section];
  let anchor = section;

  for (const blocks of pages.slice(1)) {
    const page = section.cloneNode(false) as HTMLElement;
    if (header) page.append(header.cloneNode(true));

    // Each source article keeps its own shell so column settings carry over.
    const shells = new Map<HTMLElement, HTMLElement>();
    for (const { article, element } of blocks) {
      let shell = shells.get(article);
      if (!shell) {
        shell = article.cloneNode(false) as HTMLElement;
        shells.set(article, shell);
        page.append(shell);
      }
      shell.append(element);
    }

    if (footer) page.append(footer.cloneNode(true));
    anchor.after(page);
    anchor = page;
    result.push(page);
  }

  const last = result[result.length - 1]!;
  const lastFooter = last.querySelector(':scope > footer');
  for (const note of notes) {
    if (lastFooter) lastFooter.before(note);
    else last.append(note);
  }

  for (const article of articles) {
    if (article.childElementCount === 0) article.remove();
  }

  return result;
}

/**
 * Break a table taller than a page into consecutive tables of whole rows, so
 * pagination has row boundaries to break at.
 */
function splitTable(table: HTMLTableElement, available: number): void {
  const rows = Array.from(table.rows);
  const groups: HTMLTableRowElement[][] = [];
  let current: HTMLTableRowElement[] = [];
  let groupTop = 0;

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (current.length === 0) {
      groupTop = rect.top;
    } else if (rect.bottom - groupTop > available) {
      groups.push(current);
      current = [];
      groupTop = rect.top;
    }
    current.push(row);
  }
  if (current.length > 0) groups.push(current);

  const colgroup = table.querySelector(':scope > colgroup');
  let anchor: Element = table;
  for (const group of groups.slice(1)) {
    const part = table.cloneNode(false) as HTMLTableElement;
    if (colgroup) part.append(colgroup.cloneNode(true));
    part.append(...group);
    anchor.after(part);
    anchor = part;
  }
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
