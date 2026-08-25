import { blobToBytes, makeSurface, releaseSurface, surfaceToBlob } from '../canvas.ts';
import { clampToEdge } from '../geometry.ts';
import { LIMITS } from '../limits.ts';
import { AppError, type Rotation } from '../types.ts';
import { combineOrient, isIdentity, orientFromExif, readJpegOrientation, swapsAxes, type Orient } from '../exif.ts';

export interface PreparedImage {
  bytes: Uint8Array;
  format: 'jpg' | 'png';
  /** Pixel size of the prepared bytes, after any rotation. */
  width: number;
  height: number;
}

/** Above this, lossless output is too large to be worth it. */
const LOSSLESS_MAX_PIXELS = 2_500_000;

export async function decodeBitmap(blob: Blob, applyExif: boolean): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, {
      imageOrientation: applyExif ? 'from-image' : 'none',
    });
  } catch {
    throw new AppError('This image couldn’t be read. It may be damaged or use an unsupported encoding.');
  }
}

/**
 * Turn any browser-decodable image into bytes pdf-lib can embed.
 *
 * pdf-lib only accepts JPEG and PNG, so everything else (WebP, AVIF, GIF, BMP)
 * is decoded by the browser and re-encoded. Two rules govern the output:
 *
 *  - A JPEG that is already upright and within the size cap is passed through
 *    untouched. Re-encoding a scan would lose quality for no reason.
 *  - Everything else becomes PNG when it is small enough that lossless is
 *    cheap (screenshots, diagrams, logos), and JPEG on white otherwise.
 */
export async function prepareImage(
  file: File,
  userRotation: Rotation,
  sourceFormat: string,
): Promise<PreparedImage> {
  const original = new Uint8Array(await file.arrayBuffer());
  const isJpeg = sourceFormat === 'jpeg';

  const exif = isJpeg ? orientFromExif(readJpegOrientation(original)) : orientFromExif(1);
  const orient = combineOrient(exif, userRotation);

  // Decode without EXIF applied so the transform below is the only one at play.
  const bitmap = await decodeBitmap(file, false);

  try {
    const rotated = swapsAxes(orient)
      ? { w: bitmap.height, h: bitmap.width }
      : { w: bitmap.width, h: bitmap.height };
    const target = clampToEdge(rotated.w, rotated.h, LIMITS.MAX_EDGE_PX);
    const needsResize = target.w !== rotated.w || target.h !== rotated.h;

    if (isJpeg && isIdentity(orient) && !needsResize) {
      return { bytes: original, format: 'jpg', width: rotated.w, height: rotated.h };
    }

    const keepLossless = !isJpeg && target.w * target.h <= LOSSLESS_MAX_PIXELS;
    const type = keepLossless ? 'image/png' : 'image/jpeg';

    const bytes = await drawOriented(bitmap, orient, target, type);
    return {
      bytes,
      format: keepLossless ? 'png' : 'jpg',
      width: target.w,
      height: target.h,
    };
  } finally {
    bitmap.close();
  }
}

async function drawOriented(
  bitmap: ImageBitmap,
  orient: Orient,
  target: { w: number; h: number },
  type: 'image/jpeg' | 'image/png',
): Promise<Uint8Array> {
  const { canvas, ctx } = makeSurface(target.w, target.h);

  try {
    // JPEG has no alpha channel, so anything transparent has to land on a
    // colour. White matches the page it will sit on.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, target.w, target.h);
    }

    // Undo the axis swap to get the size the bitmap is drawn at.
    const drawW = swapsAxes(orient) ? target.h : target.w;
    const drawH = swapsAxes(orient) ? target.w : target.h;

    ctx.imageSmoothingQuality = 'high';
    ctx.translate(target.w / 2, target.h / 2);
    ctx.rotate((orient.rotate * Math.PI) / 180);
    if (orient.flipX) ctx.scale(-1, 1);
    ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH);

    const blob = await surfaceToBlob(canvas, type, LIMITS.JPEG_QUALITY);
    return blobToBytes(blob);
  } finally {
    releaseSurface(canvas);
  }
}
