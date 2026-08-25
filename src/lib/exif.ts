import type { Rotation } from './types.ts';

export interface Orient {
  /** Clockwise degrees, applied after the flip. */
  rotate: Rotation;
  /** Mirror horizontally, applied to the source first. */
  flipX: boolean;
}

export const IDENTITY: Orient = { rotate: 0, flipX: false };

/** EXIF orientation values 1–8, per the TIFF tag 0x0112 table. */
const EXIF_TABLE: Record<number, Orient> = {
  1: { rotate: 0, flipX: false },
  2: { rotate: 0, flipX: true },
  3: { rotate: 180, flipX: false },
  4: { rotate: 180, flipX: true },
  5: { rotate: 270, flipX: true },
  6: { rotate: 90, flipX: false },
  7: { rotate: 90, flipX: true },
  8: { rotate: 270, flipX: false },
};

/**
 * Read the EXIF orientation tag out of a JPEG.
 *
 * This exists so an untouched JPEG can be embedded byte-for-byte when it is
 * already upright. PDF viewers ignore EXIF, so a photo carrying a rotation tag
 * has to be re-encoded with the rotation baked in — but the vast majority of
 * scans and screenshots carry no tag at all and can skip re-encoding entirely.
 *
 * Returns 1 (upright) when there is no tag or the structure is unreadable.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1; // Not on a marker boundary; give up.

    const marker = bytes[offset + 1]!;
    // Start of scan or end of image: the metadata section is over.
    if (marker === 0xda || marker === 0xd9) return 1;

    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2) return 1;

    if (marker === 0xe1 && offset + 10 <= bytes.length) {
      const isExif =
        bytes[offset + 4] === 0x45 && // E
        bytes[offset + 5] === 0x78 && // x
        bytes[offset + 6] === 0x69 && // i
        bytes[offset + 7] === 0x66 && // f
        bytes[offset + 8] === 0x00;
      if (isExif) {
        const found = readOrientationFromTiff(view, offset + 10, bytes.length);
        if (found !== null) return found;
      }
    }

    offset += 2 + segmentLength;
  }

  return 1;
}

function readOrientationFromTiff(view: DataView, tiffStart: number, limit: number): number | null {
  if (tiffStart + 8 > limit) return null;

  const byteOrder = view.getUint16(tiffStart, false);
  let littleEndian: boolean;
  if (byteOrder === 0x4949) littleEndian = true;
  else if (byteOrder === 0x4d4d) littleEndian = false;
  else return null;

  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) return null;

  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > limit) return null;

  const entryCount = view.getUint16(ifdStart, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > limit) return null;
    if (view.getUint16(entry, littleEndian) === 0x0112) {
      const value = view.getUint16(entry + 8, littleEndian);
      return value >= 1 && value <= 8 ? value : null;
    }
  }

  return null;
}

export function orientFromExif(exifValue: number): Orient {
  return EXIF_TABLE[exifValue] ?? IDENTITY;
}

/** Apply a user rotation on top of the source's own orientation. */
export function combineOrient(base: Orient, userRotation: Rotation): Orient {
  return {
    rotate: (((base.rotate + userRotation) % 360) + 360) % 360 as Rotation,
    flipX: base.flipX,
  };
}

export function isIdentity(orient: Orient): boolean {
  return orient.rotate === 0 && !orient.flipX;
}

/** Whether this transform swaps width and height. */
export function swapsAxes(orient: Orient): boolean {
  return orient.rotate === 90 || orient.rotate === 270;
}
