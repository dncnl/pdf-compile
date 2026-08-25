import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { appendPdf } from '../src/lib/convert/pdf.ts';
import { appendText, sanitizeForWinAnsi } from '../src/lib/convert/text.ts';
import { PAGE_SIZES_PT } from '../src/lib/geometry.ts';
import { DEFAULT_SETTINGS, type OutputSettings } from '../src/lib/types.ts';

function settings(patch: Partial<OutputSettings> = {}): OutputSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

/** A real PDF, built in memory, to merge from. */
async function makeSourcePdf(pageCount: number, size = PAGE_SIZES_PT.a4): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([size[0], size[1]]);
    page.drawText(`page ${i + 1}`, { x: 40, y: 40, size: 12, font });
  }
  return doc.save();
}

describe('appendPdf', () => {
  it('copies every page of the source into the output', async () => {
    const source = await makeSourcePdf(3);
    const out = await PDFDocument.create();

    const added = await appendPdf(out, source, 0);

    expect(added).toBe(3);
    expect(out.getPageCount()).toBe(3);
  });

  it('preserves the source page size rather than reflowing it', async () => {
    const source = await makeSourcePdf(1, PAGE_SIZES_PT.legal);
    const out = await PDFDocument.create();

    await appendPdf(out, source, 0);

    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(PAGE_SIZES_PT.legal[0], 2);
    expect(height).toBeCloseTo(PAGE_SIZES_PT.legal[1], 2);
  });

  it('appends to an output that already has pages, in order', async () => {
    const out = await PDFDocument.create();
    await appendPdf(out, await makeSourcePdf(2), 0);
    await appendPdf(out, await makeSourcePdf(3), 0);

    expect(out.getPageCount()).toBe(5);
  });

  it('applies a rotation on top of the page’s existing angle', async () => {
    const out = await PDFDocument.create();
    await appendPdf(out, await makeSourcePdf(1), 90);

    expect(out.getPage(0).getRotation().angle).toBe(90);
  });

  it('reports a damaged PDF in plain language', async () => {
    const out = await PDFDocument.create();
    const garbage = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0x00]);

    await expect(appendPdf(out, garbage, 0)).rejects.toThrow(/couldn’t be opened|damaged/i);
  });

  it('round-trips: a merged document reopens with the expected page count', async () => {
    const out = await PDFDocument.create();
    await appendPdf(out, await makeSourcePdf(2), 0);
    await appendPdf(out, await makeSourcePdf(4), 0);
    const bytes = await out.save({ useObjectStreams: true });

    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getPageCount()).toBe(6);
  });
});

describe('appendText', () => {
  it('produces at least one page for any input', async () => {
    const out = await PDFDocument.create();
    const pages = await appendText(out, '', settings());

    expect(pages).toBe(1);
    expect(out.getPageCount()).toBe(1);
  });

  it('breaks long input across multiple pages', async () => {
    const out = await PDFDocument.create();
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');

    const pages = await appendText(out, text, settings());

    expect(pages).toBeGreaterThan(1);
    expect(out.getPageCount()).toBe(pages);
  });

  it('wraps a long unbroken run instead of running off the page', async () => {
    const out = await PDFDocument.create();
    const pages = await appendText(out, 'x'.repeat(5000), settings());

    expect(pages).toBeGreaterThan(0);
    expect(out.getPageCount()).toBe(pages);
  });

  it('keeps a text page inside the chosen page size', async () => {
    const out = await PDFDocument.create();
    await appendText(out, 'hello', settings({ pageSize: 'letter' }));

    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(PAGE_SIZES_PT.letter[0], 2);
    expect(height).toBeCloseTo(PAGE_SIZES_PT.letter[1], 2);
  });

  it('does not throw on characters outside WinAnsi', async () => {
    const out = await PDFDocument.create();
    await expect(
      appendText(out, 'emoji 🙂 and 中文 and “smart quotes”', settings()),
    ).resolves.toBeGreaterThan(0);
  });
});

describe('sanitizeForWinAnsi', () => {
  it('maps typographic punctuation to ASCII stand-ins', () => {
    expect(sanitizeForWinAnsi('“quoted” — it’s fine…')).toBe('"quoted" - it\'s fine...');
  });

  it('replaces unrepresentable characters rather than dropping the line', () => {
    expect(sanitizeForWinAnsi('a中b')).toBe('a?b');
  });

  it('expands tabs so indentation survives', () => {
    expect(sanitizeForWinAnsi('\tindented')).toBe('    indented');
  });
});
