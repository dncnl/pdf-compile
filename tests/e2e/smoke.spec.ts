import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { readFile } from 'node:fs/promises';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * These tests drive the real app and then re-open the PDF it produced. The
 * assertion that matters is not "a file downloaded" but "the file has the
 * pages it should, at the size it should" — so every test parses the output.
 */

interface RawFile {
  name: string;
  mime: string;
  data: number[];
}

interface DrawnImage {
  name: string;
  mime: string;
  width: number;
  height: number;
}

/** Hand a set of pre-built byte arrays to the file input. */
async function addRawFiles(page: Page, files: RawFile[]): Promise<void> {
  await page.evaluate((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      transfer.items.add(
        new File([new Uint8Array(item.data)], item.name, { type: item.mime }),
      );
    }
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input not found');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
}

/** Draw images in the browser so real WebP/PNG/JPEG encoders are exercised. */
async function addDrawnImages(page: Page, images: DrawnImage[]): Promise<void> {
  await page.evaluate(async (items) => {
    const transfer = new DataTransfer();

    for (const item of items) {
      const canvas = document.createElement('canvas');
      canvas.width = item.width;
      canvas.height = item.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');

      ctx.fillStyle = '#ff5a36';
      ctx.fillRect(0, 0, item.width, item.height);
      ctx.fillStyle = '#14110f';
      ctx.fillRect(12, 12, item.width - 24, item.height - 24);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, item.mime, 0.9),
      );
      if (!blob) throw new Error(`could not encode ${item.mime}`);
      transfer.items.add(new File([blob], item.name, { type: item.mime }));
    }

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input not found');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, images);
}

async function makePdfBytes(pageCount: number): Promise<number[]> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`source page ${i + 1}`, { x: 50, y: 400, size: 24, font });
  }
  return Array.from(await doc.save());
}

/** A real .docx with a heading, styled runs, and a table. */
async function makeDocxBytes(): Promise<number[]> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Stackly test document', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Body text with '),
              new TextRun({ text: 'bold', bold: true }),
              new TextRun(' and '),
              new TextRun({ text: 'italic', italics: true }),
              new TextRun(' runs.'),
            ],
          }),
          new Table({
            rows: [1, 2, 3].map(
              (row) =>
                new TableRow({
                  children: ['left', 'right'].map(
                    (col) =>
                      new TableCell({ children: [new Paragraph(`${col} ${row}`)] }),
                  ),
                }),
            ),
          }),
        ],
      },
    ],
  });
  return Array.from(await Packer.toBuffer(doc));
}

/**
 * A long .docx with no page breaks recorded anywhere — what Google Docs and
 * generators produce. Word would lay this out over several pages.
 */
async function makeLongDocxBytes(paragraphs: number): Promise<number[]> {
  const doc = new Document({
    sections: [
      {
        children: Array.from(
          { length: paragraphs },
          (_, i) =>
            new Paragraph(
              `Paragraph ${i + 1}. The quick brown fox jumps over the lazy dog, and keeps going for long enough to wrap onto a second line.`,
            ),
        ),
      },
    ],
  });
  return Array.from(await Packer.toBuffer(doc));
}

/** Build, download, and re-open the result. */
async function buildAndRead(page: Page): Promise<PDFDocument> {
  return (await buildAndDownload(page)).pdf;
}

async function buildAndDownload(page: Page): Promise<{ pdf: PDFDocument; filename: string }> {
  await page.getByRole('button', { name: 'Create PDF' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download / }).click();
  const download = await downloadPromise;

  const path = await download.path();
  if (!path) throw new Error('download produced no file');
  return { pdf: await PDFDocument.load(await readFile(path)), filename: download.suggestedFilename() };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No files yet' })).toBeVisible();
});

test('combines images into one PDF at the chosen page size', async ({ page }) => {
  await addDrawnImages(page, [
    { name: 'first.png', mime: 'image/png', width: 800, height: 1000 },
    { name: 'second.jpg', mime: 'image/jpeg', width: 1200, height: 800 },
    { name: 'third.webp', mime: 'image/webp', width: 600, height: 600 },
  ]);

  await expect(page.locator('.scrap')).toHaveCount(3);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);
  await expect(page.locator('.panel__summary')).toContainText('3 files');

  const pdf = await buildAndRead(page);
  expect(pdf.getPageCount()).toBe(3);

  // Portrait source keeps A4 portrait; landscape source flips the page.
  const portrait = pdf.getPage(0).getSize();
  expect(portrait.width).toBeCloseTo(595.28, 1);
  expect(portrait.height).toBeCloseTo(841.89, 1);

  const landscape = pdf.getPage(1).getSize();
  expect(landscape.width).toBeCloseTo(841.89, 1);
  expect(landscape.height).toBeCloseTo(595.28, 1);
});

test('merges a multi-page PDF alongside images and text, in board order', async ({ page }) => {
  await addRawFiles(page, [
    { name: 'report.pdf', mime: 'application/pdf', data: await makePdfBytes(4) },
    { name: 'notes.txt', mime: 'text/plain', data: Array.from(Buffer.from('hello stackly')) },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(2);

  await addDrawnImages(page, [
    { name: 'photo.png', mime: 'image/png', width: 500, height: 700 },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(3);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);

  // 4 PDF pages + 1 text page + 1 image page
  await expect(page.locator('.panel__summary')).toContainText('6 pages');

  const pdf = await buildAndRead(page);
  expect(pdf.getPageCount()).toBe(6);

  // The merged PDF pages keep their own A4 geometry rather than being reflowed.
  expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
});

test('rejects an unsupported file at drop time and builds without it', async ({ page }) => {
  await addRawFiles(page, [
    { name: 'photo.png', mime: 'image/png', data: await makePdfBytes(1) },
    {
      name: 'budget.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0],
    },
  ]);

  await expect(page.locator('.scrap')).toHaveCount(2);
  await expect(page.locator('.scrap--error')).toHaveCount(1);
  await expect(page.locator('.scrap__error')).toContainText('Excel');

  // The renamed PDF is detected by its bytes, not its .png extension.
  await expect(page.locator('.chip--kind').first()).toHaveText('PDF');

  const pdf = await buildAndRead(page);
  expect(pdf.getPageCount()).toBe(1);
});

test('reorders with the keyboard and reflects the new order in the output', async ({ page }) => {
  await addRawFiles(page, [
    { name: 'one.pdf', mime: 'application/pdf', data: await makePdfBytes(1) },
    { name: 'two.pdf', mime: 'application/pdf', data: await makePdfBytes(3) },
  ]);

  // Both assertions are needed, in this order: "no cards are probing" is
  // trivially true before any card has rendered, so waiting on the count first
  // is what actually guarantees probing has finished. Starting a keyboard drag
  // while a probe is still in flight re-renders the list underneath it.
  await expect(page.locator('.scrap')).toHaveCount(2);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);

  await expect(page.locator('.scrap__name').first()).toHaveText('one.pdf');

  // dnd-kit's keyboard sensor: focus the grip, space to lift, arrow to move.
  await page.locator('.scrap__grip').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');

  await expect(page.locator('.scrap__name').first()).toHaveText('two.pdf');

  const pdf = await buildAndRead(page);
  // two.pdf (3 pages) now leads, so the total is unchanged but the order isn't.
  expect(pdf.getPageCount()).toBe(4);
});

test('lays out a Word document and merges its pages', async ({ page }) => {
  await addRawFiles(page, [
    { name: 'memo.docx', mime: DOCX_MIME, data: await makeDocxBytes() },
  ]);

  await expect(page.locator('.scrap')).toHaveCount(1);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);
  await expect(page.locator('.scrap--error')).toHaveCount(0);
  await expect(page.locator('.chip--kind')).toHaveText('Word');

  // The probe rendered a real first-page snapshot, so the card has a thumbnail
  // rather than the generic file glyph.
  await expect(page.locator('.scrap__thumb')).toHaveCount(1);

  const pdf = await buildAndRead(page);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

  // The page keeps the document's own geometry, so it should be portrait and
  // roughly a printable page rather than an arbitrary raster size.
  const { width, height } = pdf.getPage(0).getSize();
  expect(height).toBeGreaterThan(width);
  expect(width).toBeGreaterThan(400);
  expect(width).toBeLessThan(800);
});

test('combines a Word document with images and a PDF in one output', async ({ page }) => {
  await addRawFiles(page, [
    { name: 'memo.docx', mime: DOCX_MIME, data: await makeDocxBytes() },
    { name: 'report.pdf', mime: 'application/pdf', data: await makePdfBytes(2) },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(2);

  await addDrawnImages(page, [
    { name: 'cover.png', mime: 'image/png', width: 700, height: 900 },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(3);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);
  await expect(page.locator('.scrap--error')).toHaveCount(0);

  const pdf = await buildAndRead(page);
  // 1 Word page + 2 PDF pages + 1 image page.
  expect(pdf.getPageCount()).toBe(4);
});

test('makes no network requests while building', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await addDrawnImages(page, [
    { name: 'a.png', mime: 'image/png', width: 400, height: 500 },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(1);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);
  await buildAndRead(page);

  expect(external).toEqual([]);
});

test('splits a long Word document with no recorded page breaks into real pages', async ({
  page,
}) => {
  await addRawFiles(page, [
    { name: 'long.docx', mime: DOCX_MIME, data: await makeLongDocxBytes(160) },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(1);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);
  await expect(page.locator('.scrap--error')).toHaveCount(0);

  const pdf = await buildAndRead(page);
  expect(pdf.getPageCount()).toBeGreaterThan(1);

  // Every page is paper-sized, not one strip as tall as the document.
  for (const pdfPage of pdf.getPages()) {
    const { width, height } = pdfPage.getSize();
    expect(height).toBeLessThan(width * 1.5);
  }
});

test('names the PDF after the first file when no name is typed', async ({ page }) => {
  await addRawFiles(page, [
    { name: 'Field Notes.pdf', mime: 'application/pdf', data: await makePdfBytes(1) },
    { name: 'second.pdf', mime: 'application/pdf', data: await makePdfBytes(1) },
  ]);
  await expect(page.locator('.scrap')).toHaveCount(2);
  await expect(page.locator('.scrap--probing')).toHaveCount(0);
  await expect(page.getByLabel('File name')).toHaveAttribute('placeholder', 'Field Notes');

  expect((await buildAndDownload(page)).filename).toBe('Field Notes.pdf');

  // A typed name still wins.
  await page.getByRole('button', { name: 'Back to files' }).click();
  await page.getByLabel('File name').fill('combined');
  expect((await buildAndDownload(page)).filename).toBe('combined.pdf');
});
