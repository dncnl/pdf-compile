import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { blobToBytes, makeSurface, releaseSurface, surfaceToBlob } from './canvas.ts';
import { clampToEdge } from './geometry.ts';
import { LIMITS } from './limits.ts';
import { AppError } from './types.ts';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfProbe {
  thumb: Blob;
  pageCount: number;
}

/** Read a PDF's page count and render its first page as a card thumbnail. */
export async function probePdf(file: File): Promise<PdfProbe> {
  // pdf.js takes ownership of the buffer it is given, so it gets its own copy.
  const data = new Uint8Array(await file.arrayBuffer());

  // The loading task, not the document, owns the worker port — tearing down
  // the task is what actually releases it.
  const task = getDocument({ data, disableAutoFetch: true });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    void task.destroy();
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new AppError('This PDF is password-protected. Remove the password and try again.');
    }
    throw new AppError('This PDF couldn’t be opened. It may be damaged.');
  }

  try {
    const page = await doc.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = LIMITS.THUMB_EDGE_PX / Math.max(unscaled.width, unscaled.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 2) });

    // pdf.js renders into a real DOM canvas, not an OffscreenCanvas.
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AppError('Your browser blocked PDF rendering.');

    try {
      await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
      const thumb = await surfaceToBlob(canvas, 'image/jpeg', 0.8);
      return { thumb, pageCount: doc.numPages };
    } finally {
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await task.destroy();
  }
}

export interface ImageProbe {
  thumb: Blob;
  width: number;
  height: number;
}

/** Decode an image for its natural size and a downscaled card thumbnail. */
export async function probeImage(file: File): Promise<ImageProbe> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AppError('This image couldn’t be read. It may be damaged.');
  }

  try {
    const target = clampToEdge(bitmap.width, bitmap.height, LIMITS.THUMB_EDGE_PX);
    const { canvas, ctx } = makeSurface(target.w, target.h);
    try {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target.w, target.h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, target.w, target.h);
      const thumb = await surfaceToBlob(canvas, 'image/jpeg', 0.8);
      return { thumb, width: bitmap.width, height: bitmap.height };
    } finally {
      releaseSurface(canvas);
    }
  } finally {
    bitmap.close();
  }
}

/** Shrink an already-rendered page image down to card size. */
export async function downscale(blob: Blob, maxEdge = LIMITS.THUMB_EDGE_PX): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const target = clampToEdge(bitmap.width, bitmap.height, maxEdge);
    const { canvas, ctx } = makeSurface(target.w, target.h);
    try {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target.w, target.h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, target.w, target.h);
      return await surfaceToBlob(canvas, 'image/jpeg', 0.8);
    } finally {
      releaseSurface(canvas);
    }
  } finally {
    bitmap.close();
  }
}

export { blobToBytes };
