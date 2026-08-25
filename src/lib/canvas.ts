import { AppError } from './types.ts';

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export interface Surface {
  canvas: AnyCanvas;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
}

const canUseOffscreen = typeof OffscreenCanvas !== 'undefined';

export function makeSurface(width: number, height: number): Surface {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (canUseOffscreen) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new AppError('Your browser blocked image processing.');
    return { canvas, ctx };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new AppError('Your browser blocked image processing.');
  return { canvas, ctx };
}

export async function surfaceToBlob(
  canvas: AnyCanvas,
  type: 'image/jpeg' | 'image/png',
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError('Couldn’t encode this image.'))),
      type,
      quality,
    );
  });
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Release the pixel buffer of a canvas we are done with. */
export function releaseSurface(canvas: AnyCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}
