import type { MarginId, OrientationId, OutputSettings, PageSizeId } from './types.ts';

export const PT_PER_MM = 72 / 25.4;

/** Browsers treat an image pixel as 1/96 inch when printing; PDF units are 1/72. */
export const PX_TO_PT = 72 / 96;

export const PAGE_SIZES_PT: Record<Exclude<PageSizeId, 'original'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

export const MARGINS_MM: Record<MarginId, number> = {
  none: 0,
  small: 8,
  medium: 16,
  large: 25,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageLayout {
  pageW: number;
  pageH: number;
  /** Where to draw the source, in PDF points from the bottom-left corner. */
  box: Rect;
}

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

/** Largest w×h with the source aspect ratio that fits inside the box, centred. */
export function fitContain(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Smallest w×h with the source aspect ratio that covers the box, centred. */
export function fitCover(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

function applyOrientation(
  [a, b]: [number, number],
  orientation: OrientationId,
  srcW: number,
  srcH: number,
): [number, number] {
  const portrait: [number, number] = a <= b ? [a, b] : [b, a];
  const landscape: [number, number] = [portrait[1], portrait[0]];

  switch (orientation) {
    case 'portrait':
      return portrait;
    case 'landscape':
      return landscape;
    case 'auto':
      return srcW > srcH ? landscape : portrait;
  }
}

/**
 * Decide the page size and the rectangle a source is drawn into.
 *
 * `pageSize: 'original'` keeps the source at its natural size and grows the
 * page to fit it plus margins — that is what someone means by "don't resize
 * my scan". Every other page size is fixed, and the source is fitted into it.
 */
export function resolvePage(srcW: number, srcH: number, settings: OutputSettings): PageLayout {
  const margin = mmToPt(MARGINS_MM[settings.margin]);

  if (settings.pageSize === 'original') {
    const natW = srcW * PX_TO_PT;
    const natH = srcH * PX_TO_PT;
    return {
      pageW: natW + margin * 2,
      pageH: natH + margin * 2,
      box: { x: margin, y: margin, w: natW, h: natH },
    };
  }

  const [pageW, pageH] = applyOrientation(
    PAGE_SIZES_PT[settings.pageSize],
    settings.orientation,
    srcW,
    srcH,
  );

  // 'fill' deliberately ignores the margin: covering the page edge to edge is
  // the whole point, and the overflow is clipped by the page boundary.
  if (settings.fit === 'fill') {
    const cover = fitCover(srcW, srcH, pageW, pageH);
    return { pageW, pageH, box: cover };
  }

  const innerW = Math.max(1, pageW - margin * 2);
  const innerH = Math.max(1, pageH - margin * 2);
  const fitted = fitContain(srcW, srcH, innerW, innerH);
  return {
    pageW,
    pageH,
    box: { x: margin + fitted.x, y: margin + fitted.y, w: fitted.w, h: fitted.h },
  };
}

/** Scale a size down so its longest edge is at most `maxEdge`. Never scales up. */
export function clampToEdge(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}
