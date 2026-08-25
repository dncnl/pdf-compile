import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZES_PT,
  clampToEdge,
  fitContain,
  fitCover,
  mmToPt,
  resolvePage,
} from '../src/lib/geometry.ts';
import { DEFAULT_SETTINGS, type OutputSettings } from '../src/lib/types.ts';

function settings(patch: Partial<OutputSettings> = {}): OutputSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

const [A4_W, A4_H] = PAGE_SIZES_PT.a4;

describe('mmToPt', () => {
  it('converts using 72 points per inch', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
    expect(mmToPt(0)).toBe(0);
  });
});

describe('fitContain', () => {
  it('fits a wide source by width and centres it vertically', () => {
    const rect = fitContain(200, 100, 100, 100);
    expect(rect.w).toBe(100);
    expect(rect.h).toBe(50);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(25);
  });

  it('preserves the aspect ratio', () => {
    const rect = fitContain(1600, 900, 400, 400);
    expect(rect.w / rect.h).toBeCloseTo(1600 / 900, 6);
  });

  it('scales small sources up to the box', () => {
    const rect = fitContain(50, 50, 200, 200);
    expect(rect.w).toBe(200);
  });
});

describe('fitCover', () => {
  it('covers the box, overflowing on the other axis', () => {
    const rect = fitCover(200, 100, 100, 100);
    expect(rect.h).toBe(100);
    expect(rect.w).toBe(200);
    // Overflow is split evenly so the centre of the image stays centred.
    expect(rect.x).toBe(-50);
  });
});

describe('clampToEdge', () => {
  it('scales the longest edge down to the cap', () => {
    expect(clampToEdge(8000, 4000, 4000)).toEqual({ w: 4000, h: 2000 });
    expect(clampToEdge(4000, 8000, 4000)).toEqual({ w: 2000, h: 4000 });
  });

  it('never scales up', () => {
    expect(clampToEdge(100, 50, 4000)).toEqual({ w: 100, h: 50 });
  });

  it('never returns a zero dimension', () => {
    const result = clampToEdge(10000, 1, 100);
    expect(result.h).toBeGreaterThanOrEqual(1);
  });
});

describe('resolvePage', () => {
  it('uses A4 portrait for a portrait source on auto', () => {
    const { pageW, pageH } = resolvePage(800, 1200, settings());
    expect(pageW).toBeCloseTo(A4_W, 2);
    expect(pageH).toBeCloseTo(A4_H, 2);
  });

  it('swaps to landscape for a landscape source on auto', () => {
    const { pageW, pageH } = resolvePage(1200, 800, settings());
    expect(pageW).toBeCloseTo(A4_H, 2);
    expect(pageH).toBeCloseTo(A4_W, 2);
  });

  it('honours an explicit orientation over the source aspect', () => {
    const portrait = resolvePage(1200, 800, settings({ orientation: 'portrait' }));
    expect(portrait.pageW).toBeLessThan(portrait.pageH);

    const landscape = resolvePage(800, 1200, settings({ orientation: 'landscape' }));
    expect(landscape.pageW).toBeGreaterThan(landscape.pageH);
  });

  it('insets the drawing box by the margin', () => {
    const margin = mmToPt(8);
    const { box } = resolvePage(800, 1200, settings({ margin: 'small' }));
    expect(box.x).toBeGreaterThanOrEqual(margin - 0.001);
    expect(box.y).toBeGreaterThanOrEqual(margin - 0.001);
    expect(box.w).toBeLessThanOrEqual(A4_W - margin * 2 + 0.001);
  });

  it('uses the whole page when the margin is none', () => {
    const { pageW, box } = resolvePage(A4_W, A4_H, settings({ margin: 'none' }));
    expect(box.x).toBeCloseTo(0, 6);
    expect(box.w).toBeCloseTo(pageW, 6);
  });

  it('covers the page edge to edge on fill, ignoring the margin', () => {
    const { pageW, pageH, box } = resolvePage(1000, 1000, settings({ fit: 'fill', margin: 'large' }));
    expect(box.w).toBeGreaterThanOrEqual(pageW - 0.001);
    expect(box.h).toBeGreaterThanOrEqual(pageH - 0.001);
  });

  it('grows the page to the source plus margins when matching the image', () => {
    const margin = mmToPt(8);
    const { pageW, pageH, box } = resolvePage(
      960,
      480,
      settings({ pageSize: 'original', margin: 'small' }),
    );

    // 96dpi pixels converted to 72dpi points.
    expect(box.w).toBeCloseTo(720, 6);
    expect(box.h).toBeCloseTo(360, 6);
    expect(pageW).toBeCloseTo(720 + margin * 2, 6);
    expect(pageH).toBeCloseTo(360 + margin * 2, 6);
  });

  it('always produces a positive page and box', () => {
    for (const pageSize of ['a4', 'letter', 'legal', 'original'] as const) {
      for (const orientation of ['auto', 'portrait', 'landscape'] as const) {
        for (const fit of ['contain', 'fill'] as const) {
          for (const margin of ['none', 'small', 'medium', 'large'] as const) {
            const layout = resolvePage(3, 4000, settings({ pageSize, orientation, fit, margin }));
            expect(layout.pageW).toBeGreaterThan(0);
            expect(layout.pageH).toBeGreaterThan(0);
            expect(layout.box.w).toBeGreaterThan(0);
            expect(layout.box.h).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});
