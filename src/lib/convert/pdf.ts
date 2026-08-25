import { PDFDocument, degrees } from 'pdf-lib';
import { AppError, type Rotation } from '../types.ts';

/**
 * pdf-lib throws a named error for encrypted documents. It is not exported in
 * a form worth importing, so the name is matched directly.
 */
function isEncryptedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'EncryptedPDFError' || /encrypt/i.test(err.message))
  );
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (isEncryptedError(err)) {
      throw new AppError('This PDF is password-protected. Remove the password and try again.');
    }
    throw new AppError('This PDF couldn’t be opened. It may be damaged.');
  }
}

export async function readPdfPageCount(file: File): Promise<number> {
  const doc = await loadPdf(new Uint8Array(await file.arrayBuffer()));
  return doc.getPageCount();
}

/**
 * Copy every page of a source PDF into the output.
 *
 * `copyPages` carries the page content streams and resources across as-is, so
 * text stays selectable and vectors stay sharp. This is a real merge, not a
 * re-render. Interactive form fields and some annotation types do not survive
 * the copy — acceptable for a merge tool, and the alternative would mean
 * rasterizing perfectly good vector pages.
 */
export async function appendPdf(
  out: PDFDocument,
  bytes: Uint8Array,
  rotation: Rotation,
): Promise<number> {
  const src = await loadPdf(bytes);

  // A truncated or malformed PDF can parse far enough to load and still have
  // no usable page tree, in which case pdf-lib throws a raw TypeError deep in
  // the copy. That is not something to show anyone, so it is translated here.
  let copied;
  let indices: number[];
  try {
    indices = src.getPageIndices();
    if (indices.length === 0) {
      throw new AppError('This PDF has no pages.');
    }
    copied = await out.copyPages(src, indices);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('This PDF couldn’t be opened. It may be damaged.');
  }

  for (const page of copied) {
    if (rotation !== 0) {
      page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
    }
    out.addPage(page);
  }

  return copied.length;
}
