import { PDFDocument } from 'pdf-lib';
import { rasterizeDocx, extractDocxText } from './convert/docx.ts';
import { prepareImage } from './convert/image.ts';
import { appendPdf } from './convert/pdf.ts';
import { appendText } from './convert/text.ts';
import { detectFile } from './detect.ts';
import { resolvePage } from './geometry.ts';
import { LIMITS } from './limits.ts';
import {
  AppError,
  messageFor,
  type CompileProgress,
  type OutputSettings,
  type Source,
} from './types.ts';

export interface CompileWarning {
  filename: string;
  message: string;
}

export interface CompileResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: CompileWarning[];
}

/** Let the browser paint the progress update and stay responsive. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build one PDF from an ordered list of sources.
 *
 * Documents that already carry their own page geometry — PDFs and Word files —
 * keep it. Loose images are the only thing the page-size settings apply to,
 * because they are the only sources with no page size of their own.
 */
export async function compile(
  sources: Source[],
  settings: OutputSettings,
  onProgress: (progress: CompileProgress) => void,
): Promise<CompileResult> {
  const usable = sources.filter((source) => source.status === 'ready' && !source.error);
  if (usable.length === 0) {
    throw new AppError('There are no usable files to combine.');
  }

  const out = await PDFDocument.create();
  const warnings: CompileWarning[] = [];
  let failures = 0;

  for (const [index, source] of usable.entries()) {
    onProgress({
      done: index,
      total: usable.length,
      label: `Adding ${source.file.name}`,
    });
    await yieldToUi();

    try {
      const warning = await appendSource(out, source, settings, (done, total) => {
        onProgress({
          done: index,
          total: usable.length,
          label: `Adding ${source.file.name} — page ${done} of ${total}`,
        });
      });
      if (warning) warnings.push({ filename: source.file.name, message: warning });
    } catch (err) {
      failures++;
      warnings.push({ filename: source.file.name, message: messageFor(err) });
    }

    if (out.getPageCount() > LIMITS.MAX_PAGES) {
      throw new AppError(
        `That comes to more than ${LIMITS.MAX_PAGES} pages, which is more than Stackly can build at once.`,
      );
    }
  }

  if (failures === usable.length) {
    throw new AppError('None of these files could be added. See the notes on each card.');
  }
  if (out.getPageCount() === 0) {
    throw new AppError('The result came out empty.');
  }

  onProgress({ done: usable.length, total: usable.length, label: 'Writing the PDF' });
  await yieldToUi();

  out.setTitle(settings.filename);
  out.setProducer('Stackly');
  out.setCreator('Stackly');
  out.setCreationDate(new Date());
  out.setModificationDate(new Date());

  const bytes = await out.save({ useObjectStreams: true });
  return { bytes, pageCount: out.getPageCount(), warnings };
}

/**
 * Append one source to the output.
 *
 * Returns a message when the source landed but not as well as it should have;
 * throws when it did not land at all. The distinction matters — a Word file
 * that fell back to plain text still contributed pages and must not be counted
 * as a failure.
 */
async function appendSource(
  out: PDFDocument,
  source: Source,
  settings: OutputSettings,
  onPage: (done: number, total: number) => void,
): Promise<string | null> {
  switch (source.kind) {
    case 'pdf': {
      const bytes = new Uint8Array(await source.file.arrayBuffer());
      await appendPdf(out, bytes, source.rotation);
      return null;
    }

    case 'image': {
      const detection = await detectFile(source.file);
      const format = detection.ok ? detection.format : 'jpeg';
      const prepared = await prepareImage(source.file, source.rotation, format);

      const embedded =
        prepared.format === 'jpg'
          ? await out.embedJpg(prepared.bytes)
          : await out.embedPng(prepared.bytes);

      const layout = resolvePage(prepared.width, prepared.height, settings);
      const page = out.addPage([layout.pageW, layout.pageH]);
      page.drawImage(embedded, {
        x: layout.box.x,
        y: layout.box.y,
        width: layout.box.w,
        height: layout.box.h,
      });
      return null;
    }

    case 'docx': {
      try {
        const pages = await rasterizeDocx(source.file, onPage);
        for (const docxPage of pages) {
          const embedded = await out.embedJpg(docxPage.bytes);
          const page = out.addPage([docxPage.widthPt, docxPage.heightPt]);
          page.drawImage(embedded, {
            x: 0,
            y: 0,
            width: docxPage.widthPt,
            height: docxPage.heightPt,
          });
        }
        return null;
      } catch {
        // Layout failed. Fall back to the text so the file still lands in the
        // output, and tell the caller why it looks different.
        const text = await extractDocxText(source.file);
        if (text.trim().length === 0) {
          throw new AppError('This Word document couldn’t be rendered or read as text.');
        }
        await appendText(out, text, settings);
        return 'Couldn’t be laid out, so its text was added without formatting.';
      }
    }

    case 'text': {
      const text = await source.file.text();
      await appendText(out, text, settings);
      return null;
    }
  }
}
